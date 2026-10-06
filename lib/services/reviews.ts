/**
 * Weekly/monthly reviews (spec §31) and the per-trade review framework.
 *
 * Reviews are generated automatically for every week and month with closed
 * trades. A review refreshes while its period is open, or when the period's
 * trades change; otherwise it stays as generated. Regenerating never drops
 * a finding you marked important — if the data no longer produces it, it is
 * kept and marked stale.
 */
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import type { ForecastWithRevisions } from "@/lib/analytics/forecast";
import { directionMatchesBias, revisionActiveAt } from "@/lib/domain/forecast";
import { newId, nowIso } from "@/lib/domain/ids";
import type { EntityId, Review, ReviewFinding, RuleCheck } from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { generateReviewFindings, type FindingDraft } from "@/lib/reviews/generate";
import { inPeriod, periodsForDays, previousPeriod, type Period } from "@/lib/reviews/periods";
import { buildTradeReview, type TradeReview } from "@/lib/reviews/trade-review";
import { loadAnalyticsDataset, type AnalyticsDataset } from "./analytics";

interface SyncContext {
  data: AnalyticsDataset;
  checks: RuleCheck[];
  forecasts: ForecastWithRevisions[];
}

async function loadSyncContext(repos: JournalRepositories): Promise<SyncContext> {
  const [data, checks, forecasts, revisions] = await Promise.all([
    loadAnalyticsDataset(repos),
    repos.ruleChecks.listAll(),
    repos.forecasts.list(),
    repos.forecasts.listAllRevisions(),
  ]);
  return {
    data,
    checks,
    forecasts: forecasts.map((forecast) => ({
      forecast,
      revisions: revisions.filter((r) => r.forecastId === forecast.id).sort((a, b) => a.number - b.number),
    })),
  };
}

function rowsIn(rows: readonly AnalyticsRow[], period: Pick<Period, "start" | "end">): AnalyticsRow[] {
  return rows.filter((r) => inPeriod(r.day, period));
}

function draftsFor(ctx: SyncContext, period: Period): { drafts: FindingDraft[]; rows: AnalyticsRow[] } {
  const rows = rowsIn(ctx.data.rows, period);
  const ids = new Set(rows.map((r) => r.trade.id));
  return {
    rows,
    drafts: generateReviewFindings({
      kind: period.kind,
      rows,
      previousRows: rowsIn(ctx.data.rows, previousPeriod(period)),
      checks: ctx.checks.filter((c) => ids.has(c.tradeId)),
      forecasts: ctx.forecasts.filter((f) => inPeriod(f.forecast.date, period)),
    }),
  };
}

/** Apply freshly generated findings to a review, preserving important flags (by stable key). */
async function upsertFindings(
  repos: JournalRepositories,
  reviewId: EntityId,
  drafts: readonly FindingDraft[],
  now: string,
): Promise<void> {
  const existing = new Map((await repos.reviews.listFindings(reviewId)).map((f) => [f.key, f]));
  const seen = new Set<string>();
  let order = 0;
  for (const draft of drafts) {
    if (seen.has(draft.key)) continue;
    seen.add(draft.key);
    const old = existing.get(draft.key);
    await repos.reviews.saveFinding({
      id: old?.id ?? newId(),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      reviewId,
      ...draft,
      important: old?.important ?? false,
      stale: false,
      order: order++,
    });
  }
  const remove: EntityId[] = [];
  for (const old of existing.values()) {
    if (seen.has(old.key)) continue;
    if (old.important) await repos.reviews.saveFinding({ ...old, stale: true, order: order++, updatedAt: now });
    else remove.push(old.id);
  }
  await repos.reviews.deleteFindings(remove);
}

async function generate(
  repos: JournalRepositories,
  ctx: SyncContext,
  period: Period,
  existing: Review | undefined,
  now: string,
): Promise<Review> {
  const { drafts, rows } = draftsFor(ctx, period);
  const netPnl = Math.round(rows.reduce((s, r) => s + r.netPnl, 0) * 100) / 100;
  const review: Review = {
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    kind: period.kind,
    periodStart: period.start,
    periodEnd: period.end,
    status: period.end < ctx.data.today ? "COMPLETE" : "OPEN",
    generatedAt: now,
    tradeCount: rows.length,
    netPnl,
    notes: existing?.notes ?? "",
  };
  await repos.transaction(async () => {
    await repos.reviews.save(review);
    await upsertFindings(repos, review.id, drafts, now);
  });
  return review;
}

/**
 * Create or refresh reviews for every week and month with closed trades.
 * Refreshes open periods, and finished ones whose trades changed.
 */
export async function syncReviews(repos: JournalRepositories, now: string = nowIso()): Promise<Review[]> {
  const ctx = await loadSyncContext(repos);
  const periods = periodsForDays(new Set(ctx.data.rows.map((r) => r.day)));
  for (const period of periods) {
    const existing = await repos.reviews.getByPeriod(period.kind, period.start);
    const rows = rowsIn(ctx.data.rows, period);
    const netPnl = Math.round(rows.reduce((s, r) => s + r.netPnl, 0) * 100) / 100;
    const unchanged =
      existing?.status === "COMPLETE" && existing.tradeCount === rows.length && existing.netPnl === netPnl && period.end < ctx.data.today;
    if (!unchanged) await generate(repos, ctx, period, existing, now);
  }
  return repos.reviews.list();
}

/** Regenerate one review from the current data. */
export async function regenerateReview(repos: JournalRepositories, reviewId: EntityId, now: string = nowIso()): Promise<Review> {
  const review = await repos.reviews.get(reviewId);
  if (!review) throw new Error("Review not found.");
  const ctx = await loadSyncContext(repos);
  return generate(repos, ctx, { kind: review.kind, start: review.periodStart, end: review.periodEnd }, review, now);
}

export async function setFindingImportant(
  repos: JournalRepositories,
  finding: ReviewFinding,
  important: boolean,
  now: string = nowIso(),
): Promise<void> {
  await repos.reviews.saveFinding({ ...finding, important, updatedAt: now });
}

export async function saveReviewNotes(repos: JournalRepositories, reviewId: EntityId, notes: string, now: string = nowIso()) {
  const review = await repos.reviews.get(reviewId);
  if (!review) throw new Error("Review not found.");
  await repos.reviews.save({ ...review, notes, updatedAt: now });
}

// ── reads ────────────────────────────────────────────────────────────────

export interface ImportantFinding {
  finding: ReviewFinding;
  review: Review;
}

export interface ReviewsOverview {
  reviews: Review[];
  important: ImportantFinding[];
}

export async function loadReviewsOverview(repos: JournalRepositories): Promise<ReviewsOverview> {
  const reviews = await syncReviews(repos);
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const important = (await repos.reviews.listImportantFindings())
    .flatMap((finding) => {
      const review = byId.get(finding.reviewId);
      return review ? [{ finding, review }] : [];
    })
    .sort((a, b) => b.review.periodStart.localeCompare(a.review.periodStart));
  return { reviews, important };
}

export interface ReviewDetail {
  review: Review;
  findings: ReviewFinding[];
  /** Closed trades by id, for showing each finding's evidence. */
  rows: Map<EntityId, AnalyticsRow>;
  timezone: string;
}

export async function loadReviewDetail(repos: JournalRepositories, reviewId: EntityId): Promise<ReviewDetail> {
  const review = await repos.reviews.get(reviewId);
  if (!review) throw new Error("Review not found.");
  const [findings, data] = await Promise.all([repos.reviews.listFindings(reviewId), loadAnalyticsDataset(repos)]);
  return { review, findings, rows: new Map(data.rows.map((r) => [r.trade.id, r])), timezone: data.timezone };
}

/** For the dashboard: important findings first, then the latest review's observations. */
export async function loadRecentFindings(repos: JournalRepositories, limit = 4): Promise<ImportantFinding[]> {
  const reviews = await syncReviews(repos);
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const important = (await repos.reviews.listImportantFindings())
    .filter((f) => !f.stale && byId.has(f.reviewId))
    .map((finding) => ({ finding, review: byId.get(finding.reviewId)! }))
    .sort((a, b) => b.review.periodStart.localeCompare(a.review.periodStart));
  const latest = reviews.find((r) => r.kind === "WEEKLY");
  const latestFindings = latest
    ? (await repos.reviews.listFindings(latest.id))
        .filter((f) => f.kind !== "QUESTION" && !f.important)
        .map((finding) => ({ finding, review: latest }))
    : [];
  return [...important, ...latestFindings].slice(0, limit);
}

/** The deterministic review of one closed trade; null while the trade is open. */
export async function loadTradeReview(repos: JournalRepositories, tradeId: EntityId): Promise<TradeReview | null> {
  const data = await loadAnalyticsDataset(repos);
  const row = data.rows.find((r) => r.trade.id === tradeId);
  if (!row) return null;
  const [checks, psychology, link] = await Promise.all([
    repos.ruleChecks.listForTrade(tradeId),
    repos.psychology.listForTrade(tradeId),
    repos.forecasts.getLinkForTrade(tradeId),
  ]);
  let scenarioTitle: string | null = null;
  let matchesBiasAtEntry: boolean | null = null;
  if (link?.planned && link.forecastId) {
    const revisions = await repos.forecasts.listRevisions(link.forecastId);
    const atEntry = revisions.find((r) => r.id === link.revisionIdAtEntry) ?? revisionActiveAt(revisions, row.trade.openedAt);
    scenarioTitle =
      revisions.flatMap((r) => r.content.scenarios).find((s) => s.id === link.scenarioId)?.title ?? null;
    matchesBiasAtEntry = atEntry ? directionMatchesBias(row.trade.direction, atEntry.content.bias) : null;
  }
  return buildTradeReview({ row, checks, psychology, scenarioTitle, matchesBiasAtEntry, history: data.rows });
}
