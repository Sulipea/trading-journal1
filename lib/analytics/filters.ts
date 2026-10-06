/** Analytics filters and time ranges (spec §18). Pure. */
import type { Direction, EntityId, InstrumentRoot } from "@/lib/domain/types";
import type { TradeQuality } from "@/lib/calculations/quality";
import type { AnalyticsRow } from "./dataset";

export type TimeRange = "TODAY" | "WEEK" | "MONTH" | "YEAR" | "ALL" | "CUSTOM";
export type Grade = NonNullable<TradeQuality["grade"]>;

/** Setup filter value for trades without a setup. */
export const NO_SETUP = "__none__";

export interface AnalyticsFilter {
  range: TimeRange;
  /** Inclusive YYYY-MM-DD bounds, for CUSTOM. */
  from: string | null;
  to: string | null;
  instruments: InstrumentRoot[];
  direction: Direction | "ALL";
  /** Setup ids, or NO_SETUP. Empty = any. */
  setupIds: (EntityId | typeof NO_SETUP)[];
  sessions: string[];
  /** 0 = Monday … 6 = Sunday. */
  weekdays: number[];
  /** Trades with any of these emotions (any phase). */
  emotions: string[];
  ruleAdherence: "ALL" | "CLEAN" | "VIOLATED";
  grades: Grade[];
}

export const DEFAULT_FILTER: AnalyticsFilter = {
  range: "ALL",
  from: null,
  to: null,
  instruments: [],
  direction: "ALL",
  setupIds: [],
  sessions: [],
  weekdays: [],
  emotions: [],
  ruleAdherence: "ALL",
  grades: [],
};

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive day bounds for a range; weeks start on Monday. Null bound = open-ended. */
export function rangeBounds(
  filter: Pick<AnalyticsFilter, "range" | "from" | "to">,
  today: string,
): { from: string | null; to: string | null } {
  switch (filter.range) {
    case "TODAY":
      return { from: today, to: today };
    case "WEEK": {
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: shiftDay(today, -weekday), to: today };
    }
    case "MONTH":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "YEAR":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "CUSTOM":
      return { from: filter.from, to: filter.to };
    case "ALL":
      return { from: null, to: null };
  }
}

export function applyFilter(rows: readonly AnalyticsRow[], filter: AnalyticsFilter, today: string): AnalyticsRow[] {
  const { from, to } = rangeBounds(filter, today);
  return rows.filter((r) => {
    if (from && r.day < from) return false;
    if (to && r.day > to) return false;
    if (filter.instruments.length && !filter.instruments.includes(r.trade.root)) return false;
    if (filter.direction !== "ALL" && r.trade.direction !== filter.direction) return false;
    if (filter.setupIds.length && !filter.setupIds.includes(r.trade.setupId ?? NO_SETUP)) return false;
    if (filter.sessions.length && (r.trade.session === null || !filter.sessions.includes(r.trade.session))) return false;
    if (filter.weekdays.length && !filter.weekdays.includes(r.weekday)) return false;
    if (filter.emotions.length && !r.emotions.some((e) => filter.emotions.includes(e))) return false;
    if (filter.ruleAdherence !== "ALL" && r.ruleAdherence !== filter.ruleAdherence) return false;
    if (filter.grades.length && (r.quality.grade === null || !filter.grades.includes(r.quality.grade))) return false;
    return true;
  });
}

/** Number of active (non-range) filters, for the "Clear filters" affordance. */
export function activeFilterCount(filter: AnalyticsFilter): number {
  return (
    (filter.instruments.length ? 1 : 0) +
    (filter.direction !== "ALL" ? 1 : 0) +
    (filter.setupIds.length ? 1 : 0) +
    (filter.sessions.length ? 1 : 0) +
    (filter.weekdays.length ? 1 : 0) +
    (filter.emotions.length ? 1 : 0) +
    (filter.ruleAdherence !== "ALL" ? 1 : 0) +
    (filter.grades.length ? 1 : 0)
  );
}
