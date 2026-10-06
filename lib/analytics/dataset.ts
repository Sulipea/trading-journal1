/**
 * The analytics dataset: one row per closed, non-deleted trade with every
 * dimension the Analytics page filters and groups by, precomputed once.
 * Pure — callers load the inputs through repositories.
 */
import { sessionLabel } from "@/lib/domain/defaults";
import { revisionActiveAt } from "@/lib/domain/forecast";
import type {
  EntityId,
  ForecastRevision,
  ForecastTradeLink,
  PsychologyEntry,
  PsychologyPhase,
  RuleCheck,
  SessionOption,
  Setup,
} from "@/lib/domain/types";
import type { TradeResultRow } from "./stats";

export type RuleAdherence = "CLEAN" | "VIOLATED" | "UNCHECKED";
export type ForecastAdherenceKey = "YES" | "PARTIAL" | "NO" | "UNPLANNED" | "UNLINKED";

export interface AnalyticsRow extends TradeResultRow {
  /** Day the trade closed (journal timezone) — P&L is realized on this day. */
  day: string;
  /** Entry hour 0–23 and weekday 0 (Mon) – 6 (Sun), journal timezone. */
  hour: number;
  weekday: number;
  setupName: string | null;
  sessionLabel: string | null;
  /** Emotions recorded in any phase, de-duplicated. */
  emotions: string[];
  /** Phase → rating name → 1–5. */
  ratings: Partial<Record<PsychologyPhase, Record<string, number>>>;
  ruleChecks: number;
  violations: number;
  ruleAdherence: RuleAdherence;
  forecastAdherence: ForecastAdherenceKey;
  /** Condition tags from the forecast revision active at entry (lower-case). */
  conditionTags: string[];
}

export interface DatasetContext {
  timezone: string;
  sessions: readonly SessionOption[];
  setups: readonly Setup[];
  psychology: readonly PsychologyEntry[];
  checks: readonly RuleCheck[];
  links: readonly ForecastTradeLink[];
  revisions: readonly ForecastRevision[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Creating a formatter is far more expensive than using one, so keep one per timezone.
const formatters = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Calendar day, hour and weekday of an instant in a timezone. */
export function zonedParts(iso: string, timezone: string): { day: string; hour: number; weekday: number } {
  const parts = zonedFormatter(timezone).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => EntityId): Map<EntityId, T[]> {
  const map = new Map<EntityId, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function buildAnalyticsRows(rows: readonly TradeResultRow[], ctx: DatasetContext): AnalyticsRow[] {
  const setupNames = new Map(ctx.setups.map((s) => [s.id, s.name]));
  const psychByTrade = groupBy(ctx.psychology, (p) => p.tradeId);
  const checksByTrade = groupBy(ctx.checks, (c) => c.tradeId);
  const linkByTrade = new Map(ctx.links.map((l) => [l.tradeId, l]));
  const revisionsByForecast = groupBy(ctx.revisions, (r) => r.forecastId);

  return rows.map((row) => {
    const { trade } = row;
    const entry = zonedParts(trade.openedAt, ctx.timezone);
    const psych = psychByTrade.get(trade.id) ?? [];
    const checks = checksByTrade.get(trade.id) ?? [];
    const violations = checks.filter((c) => c.status === "VIOLATED").length;
    const link = linkByTrade.get(trade.id);

    let conditionTags: string[] = [];
    if (link?.forecastId) {
      const revisions = revisionsByForecast.get(link.forecastId) ?? [];
      const atEntry = revisions.find((r) => r.id === link.revisionIdAtEntry) ?? revisionActiveAt(revisions, trade.openedAt);
      conditionTags = [...new Set((atEntry?.content.conditionTags ?? []).map((t) => t.toLowerCase()))];
    }

    return {
      ...row,
      day: zonedParts(trade.closedAt ?? trade.openedAt, ctx.timezone).day,
      hour: entry.hour,
      weekday: entry.weekday,
      setupName: trade.setupId ? (setupNames.get(trade.setupId) ?? null) : null,
      sessionLabel: trade.session ? sessionLabel(trade.session, ctx.sessions) : null,
      emotions: [...new Set(psych.flatMap((p) => p.emotions))],
      ratings: Object.fromEntries(psych.map((p) => [p.phase, p.ratings])),
      ruleChecks: checks.length,
      violations,
      ruleAdherence: checks.length === 0 ? "UNCHECKED" : violations > 0 ? "VIOLATED" : "CLEAN",
      forecastAdherence: !link ? "UNLINKED" : !link.planned ? "UNPLANNED" : (link.adherence ?? "UNLINKED"),
      conditionTags,
    };
  });
}

export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
