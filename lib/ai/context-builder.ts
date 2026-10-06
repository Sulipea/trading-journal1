/**
 * Builds the context sent to the AI for each task (spec §33): only what is
 * relevant, never the whole journal, never screenshots unless selected.
 * Trades are given short references ("T0", "T1", …) so AI output can cite
 * them; the reference → id map stays in the browser.
 */
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { breakdown, type Dimension } from "@/lib/analytics/breakdowns";
import type { Pattern } from "@/lib/analytics/patterns";
import { groupStats, type GroupStats } from "@/lib/analytics/stats";
import type {
  EntityId,
  PsychologyEntry,
  Review,
  ReviewFinding,
  Rule,
  RuleCheck,
  Setup,
  Trade,
  TradeEvent,
} from "@/lib/domain/types";
import type { TradeMetrics } from "@/lib/services/trade-metrics";
import type { TradeReview } from "@/lib/reviews/trade-review";

export class TradeRefs {
  private readonly byId = new Map<EntityId, string>();
  private readonly byRef = new Map<string, EntityId>();

  ref(tradeId: EntityId): string {
    let ref = this.byId.get(tradeId);
    if (!ref) {
      ref = `T${this.byId.size}`;
      this.byId.set(tradeId, ref);
      this.byRef.set(ref, tradeId);
    }
    return ref;
  }

  toRecord(): Record<string, EntityId> {
    return Object.fromEntries(this.byRef);
  }
}

const round = (v: number | null, digits = 2) => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** One trade as a compact row. No free text — that stays out unless the task needs it. */
export function compactTrade(row: AnalyticsRow, ref: string) {
  const t = row.trade;
  return {
    ref,
    closed: row.day,
    hour: row.hour,
    symbol: t.symbol,
    direction: t.direction,
    setup: row.setupName,
    session: row.sessionLabel,
    netPnl: round(row.netPnl),
    r: round(row.rMultiple),
    quality: row.quality.score,
    processOutcome: row.quality.processOutcome,
    emotions: row.emotions,
    ruleViolations: row.violations,
    ruleAdherence: row.ruleAdherence,
    forecastAdherence: row.forecastAdherence,
    conditions: row.conditionTags,
  };
}

function compactStats(s: GroupStats) {
  return {
    trades: s.count,
    smallSample: s.smallSample,
    winRate: round(s.winRate),
    netPnl: round(s.netPnl),
    expectancy: round(s.expectancy),
    averageR: round(s.averageR),
    profitFactor: round(s.profitFactor),
    averageQuality: round(s.averageQuality, 0),
  };
}

function breakdownSummary(rows: readonly AnalyticsRow[], dimension: Dimension) {
  return breakdown(rows, dimension).map((g) => ({ group: g.label, ...compactStats(g.stats), violationRate: round(g.violationRate) }));
}

// ── trade review ─────────────────────────────────────────────────────────

export interface TradeReviewContextInput {
  row: AnalyticsRow;
  trade: Trade;
  events: readonly TradeEvent[];
  metrics: TradeMetrics;
  psychology: readonly PsychologyEntry[];
  checks: readonly RuleCheck[];
  forecast: { scenario: string | null; adherence: string; reason: string; biasAtEntry: string | null } | null;
  deterministic: TradeReview;
  /** Captions of screenshots attached to the request, in order. */
  screenshotCaptions: string[];
}

export function buildTradeReviewContext(input: TradeReviewContextInput) {
  const refs = new TradeRefs();
  const { trade, metrics } = input;
  const self = refs.ref(trade.id);
  const context = {
    trade: {
      ...compactTrade(input.row, self),
      opened: trade.openedAt,
      closedAt: trade.closedAt,
      plan: {
        entry: trade.plannedEntry,
        stop: trade.plannedStop,
        target: trade.plannedTarget,
        contracts: trade.plannedContracts,
        riskDollars: metrics.plannedRisk,
        rewardRisk: round(metrics.plannedRewardRisk),
      },
      actual: {
        fills: input.events.map((e) => ({ type: e.type, price: e.price, quantity: e.quantity, time: e.timestamp, reason: e.reason || undefined })),
        averageEntry: round(metrics.fills?.averageEntry ?? null),
        averageExit: round(metrics.fills?.averageExit ?? null),
        maxContracts: metrics.fills?.maxOpenQuantity ?? null,
        riskDollars: metrics.actualRisk,
        finalStop: trade.finalStop,
        finalTarget: trade.finalTarget,
        fees: trade.fees,
        grossPnl: metrics.fills?.grossPnl ?? null,
      },
      qualityComponents: input.row.quality.components,
      reasoning: trade.reasoning,
      marketConditions: trade.marketConditions,
      executionRating: trade.executionRating,
      executionNotes: trade.executionNotes,
      notes: trade.notes,
      psychology: input.psychology.map((p) => ({ phase: p.phase, emotions: p.emotions, ratings: p.ratings, notes: p.text })),
      rules: input.checks.map((c) => ({ rule: c.ruleName, severity: c.severity, status: c.status, reason: c.reason || undefined })),
      skippedSetupRequirements: trade.requirementOverrides.map((o) => ({ field: o.field, reason: o.reason })),
      forecast: input.forecast,
    },
    deterministicFindings: input.deterministic.sections.map((s) => ({ section: s.title, items: s.items.map((i) => i.text) })),
    similarTrades: input.deterministic.similar.map((s) => ({
      ...compactTrade(s.row, refs.ref(s.row.trade.id)),
      alike: s.similarities,
      different: s.differences,
    })),
    similarTradesSummary: compactStats(input.deterministic.similarStats),
    screenshots: input.screenshotCaptions,
  };
  return { context, refs: refs.toRecord() };
}

// ── periodic review ──────────────────────────────────────────────────────

export function buildPeriodReviewContext(review: Review, findings: readonly ReviewFinding[], rows: readonly AnalyticsRow[]) {
  const refs = new TradeRefs();
  const trades = rows.map((r) => compactTrade(r, refs.ref(r.trade.id)));
  const context = {
    period: { kind: review.kind, start: review.periodStart, end: review.periodEnd },
    summary: compactStats(groupStats(rows)),
    findings: findings
      .filter((f) => !f.stale)
      .map((f) => ({ section: f.section, kind: f.kind, title: f.title, detail: f.detail || undefined, trades: f.tradeIds.map((id) => refs.ref(id)) })),
    trades,
    notes: review.notes || undefined,
  };
  return { context, refs: refs.toRecord() };
}

// ── pattern discovery ────────────────────────────────────────────────────

/** Most recent trades sent for pattern discovery; older ones are summarised by the breakdowns. */
export const MAX_PATTERN_TRADES = 300;

export function buildPatternsContext(rows: readonly AnalyticsRow[], setups: readonly Setup[], patterns: readonly Pattern[]) {
  const refs = new TradeRefs();
  const recent = [...rows].sort((a, b) => b.day.localeCompare(a.day)).slice(0, MAX_PATTERN_TRADES);
  const context = {
    totalClosedTrades: rows.length,
    tradesIncluded: recent.length,
    overall: compactStats(groupStats(rows)),
    trades: recent.map((r) => compactTrade(r, refs.ref(r.trade.id))),
    setups: setups
      .filter((s) => s.active)
      .map((s) => ({ name: s.name, category: s.category, tags: s.tags, description: s.description })),
    statisticallyDetectedPatterns: patterns.map((p) => ({
      statement: p.statement,
      group: compactStats(p.group),
      rest: compactStats(p.rest),
      trades: p.tradeIds.filter((id) => recent.some((r) => r.trade.id === id)).map((id) => refs.ref(id)),
    })),
  };
  return { context, refs: refs.toRecord() };
}

// ── chat ─────────────────────────────────────────────────────────────────

export const CHAT_RECENT_TRADES = 60;

export function buildChatContext(input: {
  rows: readonly AnalyticsRow[];
  setups: readonly Setup[];
  rules: readonly Rule[];
  patterns: readonly Pattern[];
  startingBalance: number;
  today: string;
}) {
  const refs = new TradeRefs();
  const recent = [...input.rows].sort((a, b) => b.day.localeCompare(a.day)).slice(0, CHAT_RECENT_TRADES);
  const context = {
    today: input.today,
    startingBalance: input.startingBalance,
    allClosedTrades: compactStats(groupStats(input.rows)),
    bySetup: breakdownSummary(input.rows, "setup"),
    bySession: breakdownSummary(input.rows, "session"),
    byHour: breakdownSummary(input.rows, "hour"),
    byWeekday: breakdownSummary(input.rows, "weekday"),
    byDirection: breakdownSummary(input.rows, "direction"),
    byEmotion: breakdownSummary(input.rows, "emotion"),
    byRuleAdherence: breakdownSummary(input.rows, "ruleAdherence"),
    byForecastAdherence: breakdownSummary(input.rows, "forecastAdherence"),
    byQuality: breakdownSummary(input.rows, "quality"),
    recentTrades: recent.map((r) => compactTrade(r, refs.ref(r.trade.id))),
    setups: input.setups.filter((s) => s.active).map((s) => ({ name: s.name, category: s.category, description: s.description })),
    rules: input.rules.filter((r) => r.active).map((r) => ({ name: r.name, severity: r.severity, required: r.required })),
    detectedPatterns: input.patterns.map((p) => p.statement),
  };
  return { context, refs: refs.toRecord() };
}
