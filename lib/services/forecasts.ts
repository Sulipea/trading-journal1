/**
 * Daily forecast workflow (spec §21–25, §29):
 * create → edit draft → finalize → revise with a reason (previous revisions
 * are kept) → snapshots and level interactions during the day → end-of-day
 * review → locked after the day, with manual reopen.
 */
import {
  contentProblems,
  diffForecastContent,
  emptyForecastContent,
  isForecastLocked,
  latestRevision,
} from "@/lib/domain/forecast";
import { newId, nowIso } from "@/lib/domain/ids";
import { forecastContentSchema, tradingDateSchema } from "@/lib/domain/schemas";
import type {
  Bias,
  EntityId,
  Forecast,
  ForecastContent,
  ForecastReview,
  ForecastRevision,
  LevelInteraction,
  LevelReaction,
  MarketSnapshot,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { cleanList } from "./settings";
import { calendarDay } from "./dashboard";

export class ForecastLockedError extends Error {
  override name = "ForecastLockedError";
  constructor() {
    super("This forecast's day is over, so it's locked. Reopen it to make changes.");
  }
}

/** Today's trading date in the journal timezone. */
export async function journalToday(repos: JournalRepositories, now: Date = new Date()): Promise<string> {
  return calendarDay(now, (await repos.settings.getApp()).timezone);
}

async function loadForecast(repos: JournalRepositories, id: EntityId): Promise<Forecast> {
  const forecast = await repos.forecasts.get(id);
  if (!forecast) throw new Error("Forecast not found.");
  return forecast;
}

async function assertEditable(repos: JournalRepositories, forecast: Forecast, today?: string): Promise<void> {
  if (isForecastLocked(forecast, today ?? (await journalToday(repos)))) throw new ForecastLockedError();
}

function normalizeContent(content: ForecastContent): ForecastContent {
  const parsed = forecastContentSchema.parse({
    ...content,
    conditionTags: cleanList(content.conditionTags),
    setupIds: [...new Set(content.setupIds)],
  });
  const problems = contentProblems(parsed);
  if (problems.length > 0) throw new Error(problems.join(" "));
  return parsed;
}

// ── lifecycle ────────────────────────────────────────────────────────────

/** Start the forecast for a day as a draft. One forecast per day. */
export async function createForecast(
  repos: JournalRepositories,
  date: string,
  content: ForecastContent = emptyForecastContent(),
  now: string = nowIso(),
): Promise<Forecast> {
  return repos.transaction(async () => {
    tradingDateSchema.parse(date);
    if (await repos.forecasts.getByDate(date)) throw new Error(`There's already a forecast for ${date}.`);
    const revisionId = newId();
    const forecast: Forecast = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      date,
      status: "DRAFT",
      activeRevisionId: revisionId,
      reopenedAt: null,
      review: null,
    };
    await repos.forecasts.save(forecast);
    await repos.forecasts.saveRevision({
      id: revisionId,
      createdAt: now,
      updatedAt: now,
      forecastId: forecast.id,
      number: 0,
      finalizedAt: null,
      reason: "",
      changes: [],
      content: normalizeContent(content),
      snapshotId: null,
    });
    return forecast;
  });
}

/** Edit the draft. Only possible before the forecast is finalized. */
export async function updateDraft(
  repos: JournalRepositories,
  forecastId: EntityId,
  content: ForecastContent,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const forecast = await loadForecast(repos, forecastId);
    await assertEditable(repos, forecast);
    if (forecast.status !== "DRAFT") throw new Error("This forecast is final. Use Create Revision to change it.");
    const draft = await repos.forecasts.getRevision(forecast.activeRevisionId);
    if (!draft) throw new Error("Draft not found.");
    await repos.forecasts.saveRevision({ ...draft, content: normalizeContent(content), updatedAt: now });
    await repos.forecasts.save({ ...forecast, updatedAt: now });
  });
}

/** Explicitly finalize the forecast (spec §25 step 2). The original becomes immutable. */
export async function finalizeForecast(
  repos: JournalRepositories,
  forecastId: EntityId,
  now: string = nowIso(),
): Promise<Forecast> {
  return repos.transaction(async () => {
    const forecast = await loadForecast(repos, forecastId);
    await assertEditable(repos, forecast);
    if (forecast.status === "FINAL") return forecast;
    const draft = await repos.forecasts.getRevision(forecast.activeRevisionId);
    if (!draft) throw new Error("Draft not found.");
    normalizeContent(draft.content);
    await repos.forecasts.saveRevision({ ...draft, finalizedAt: now, updatedAt: now });
    const next: Forecast = { ...forecast, status: "FINAL", updatedAt: now };
    await repos.forecasts.save(next);
    return next;
  });
}

/**
 * Revise a final forecast (spec §25): records why and exactly what changed,
 * keeps every previous revision, and makes the new one active.
 */
export async function createRevision(
  repos: JournalRepositories,
  forecastId: EntityId,
  content: ForecastContent,
  reason: string,
  options: { snapshotId?: EntityId | null; now?: string } = {},
): Promise<ForecastRevision> {
  const now = options.now ?? nowIso();
  return repos.transaction(async () => {
    const forecast = await loadForecast(repos, forecastId);
    await assertEditable(repos, forecast);
    if (forecast.status !== "FINAL") throw new Error("Finalize the forecast before revising it.");
    if (!reason.trim()) throw new Error("Explain why the forecast changed.");
    const revisions = await repos.forecasts.listRevisions(forecastId);
    const previous = latestRevision(revisions)!;
    const next = normalizeContent(content);
    const changes = diffForecastContent(previous.content, next);
    if (changes.length === 0) throw new Error("Nothing changed, so there's nothing to revise.");

    const revision: ForecastRevision = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      forecastId,
      number: previous.number + 1,
      finalizedAt: now,
      reason: reason.trim(),
      changes,
      content: next,
      snapshotId: options.snapshotId ?? null,
    };
    await repos.forecasts.saveRevision(revision);
    await repos.forecasts.save({ ...forecast, activeRevisionId: revision.id, updatedAt: now });
    return revision;
  });
}

export interface SnapshotInput {
  at: string;
  conditions: string;
  conditionTags: string[];
  bias: Bias | null;
  notes: string;
  /** Also apply these conditions (and bias, if given) to the forecast. */
  updateForecast: boolean;
}

/**
 * Record a market-condition snapshot (spec §24). Optionally carries the new
 * conditions into the forecast: edits the draft, or creates a revision.
 */
export async function addMarketSnapshot(
  repos: JournalRepositories,
  forecastId: EntityId,
  input: SnapshotInput,
  now: string = nowIso(),
): Promise<{ snapshot: MarketSnapshot; revision: ForecastRevision | null }> {
  return repos.transaction(async () => {
    const forecast = await loadForecast(repos, forecastId);
    await assertEditable(repos, forecast);
    const snapshot: MarketSnapshot = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      forecastId,
      at: input.at,
      conditions: input.conditions.trim(),
      conditionTags: cleanList(input.conditionTags),
      bias: input.bias,
      notes: input.notes.trim(),
    };
    await repos.forecasts.saveSnapshot(snapshot);
    if (!input.updateForecast) return { snapshot, revision: null };

    const current = latestRevision(await repos.forecasts.listRevisions(forecastId))!;
    const content: ForecastContent = {
      ...current.content,
      marketConditions: snapshot.conditions,
      conditionTags: snapshot.conditionTags.length ? snapshot.conditionTags : current.content.conditionTags,
      bias: snapshot.bias ?? current.content.bias,
    };
    if (forecast.status === "DRAFT") {
      await updateDraft(repos, forecastId, content, now);
      return { snapshot, revision: null };
    }
    const changes = diffForecastContent(current.content, normalizeContent(content));
    if (changes.length === 0) return { snapshot, revision: null };
    const revision = await createRevision(repos, forecastId, content, `Market-condition snapshot: ${snapshot.conditions}`, {
      snapshotId: snapshot.id,
      now,
    });
    return { snapshot, revision };
  });
}

/** Reopen a locked past forecast for changes, or lock it again. */
export async function setForecastReopened(
  repos: JournalRepositories,
  forecastId: EntityId,
  reopened: boolean,
  now: string = nowIso(),
): Promise<Forecast> {
  return repos.transaction(async () => {
    const forecast = await loadForecast(repos, forecastId);
    if (forecast.date >= (await journalToday(repos))) {
      throw new Error("Forecasts lock after their day is over; today's forecast is already open.");
    }
    const next: Forecast = { ...forecast, reopenedAt: reopened ? now : null, updatedAt: now };
    await repos.forecasts.save(next);
    return next;
  });
}

// ── after-the-fact records (allowed on locked forecasts) ─────────────────

export interface LevelInteractionInput {
  touched: boolean;
  outcome: LevelReaction | null;
  source: LevelInteraction["source"];
  notes: string;
  tradeIds: EntityId[];
}

/** Record what happened at a key level. This is an observation, so it never revises the forecast. */
export async function saveLevelInteraction(
  repos: JournalRepositories,
  forecastId: EntityId,
  levelId: EntityId,
  input: LevelInteractionInput,
  now: string = nowIso(),
): Promise<LevelInteraction> {
  return repos.transaction(async () => {
    await loadForecast(repos, forecastId);
    const levels = (await repos.forecasts.listRevisions(forecastId)).flatMap((r) => r.content.keyLevels);
    if (!levels.some((l) => l.id === levelId)) throw new Error("Key level not found on this forecast.");
    const existing = (await repos.forecasts.listInteractions(forecastId)).find((i) => i.levelId === levelId);
    const interaction: LevelInteraction = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      forecastId,
      levelId,
      touched: input.touched || input.outcome !== null,
      outcome: input.outcome,
      source: input.source,
      notes: input.notes.trim(),
      tradeIds: [...new Set(input.tradeIds)],
    };
    await repos.forecasts.saveInteraction(interaction);
    return interaction;
  });
}

/** Save the end-of-day review (spec §29). */
export async function saveForecastReview(
  repos: JournalRepositories,
  forecastId: EntityId,
  input: Omit<ForecastReview, "reviewedAt">,
  now: string = nowIso(),
): Promise<Forecast> {
  return repos.transaction(async () => {
    const forecast = await loadForecast(repos, forecastId);
    if (forecast.status !== "FINAL") throw new Error("Finalize the forecast before reviewing it.");
    const next: Forecast = {
      ...forecast,
      review: { ...input, actualOutcome: input.actualOutcome.trim(), notes: input.notes.trim(), reviewedAt: now },
      updatedAt: now,
    };
    await repos.forecasts.save(next);
    return next;
  });
}
