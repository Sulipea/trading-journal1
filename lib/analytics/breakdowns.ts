/**
 * Group analytics rows by a dimension (spec §18), with sample sizes.
 * Pure.
 */
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type { EntityId } from "@/lib/domain/types";
import { WEEKDAY_LABELS, type AnalyticsRow } from "./dataset";
import { groupStats, type GroupStats } from "./stats";

export type Dimension =
  | "setup"
  | "instrument"
  | "session"
  | "hour"
  | "weekday"
  | "direction"
  | "emotion"
  | "ruleAdherence"
  | "quality"
  | "condition"
  | "forecastAdherence";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  setup: "Setup",
  instrument: "Instrument",
  session: "Session",
  hour: "Hour of day",
  weekday: "Day of week",
  direction: "Direction",
  emotion: "Emotion",
  ruleAdherence: "Rule adherence",
  quality: "Trade quality",
  condition: "Market conditions",
  forecastAdherence: "Forecast adherence",
};

export interface BreakdownGroup {
  key: string;
  label: string;
  stats: GroupStats;
  /** Share of checked trades in the group with at least one rule violation. */
  violationRate: number | null;
  tradeIds: EntityId[];
}

interface Key {
  key: string;
  label: string;
  /** Sort position for naturally ordered dimensions. */
  order?: number;
}

const ADHERENCE_LABELS: Record<AnalyticsRow["ruleAdherence"], string> = {
  CLEAN: "No violations",
  VIOLATED: "With violations",
  UNCHECKED: "Not checked",
};
const FORECAST_LABELS: Record<AnalyticsRow["forecastAdherence"], string> = {
  YES: "Followed forecast",
  PARTIAL: "Partially followed",
  NO: "Didn't follow",
  UNPLANNED: "Unplanned",
  UNLINKED: "Not linked",
};

/** The group(s) a row belongs to. Multi-valued dimensions (emotion, condition) can return several. */
function keysFor(row: AnalyticsRow, dimension: Dimension): Key[] {
  const t = row.trade;
  switch (dimension) {
    case "setup":
      return [{ key: t.setupId ?? "none", label: row.setupName ?? "No setup" }];
    case "instrument":
      return [{ key: t.root, label: `${t.root} · ${CONTRACT_SPECS[t.root].name}` }];
    case "session":
      return [{ key: t.session ?? "none", label: row.sessionLabel ?? "No session" }];
    case "hour":
      return [{ key: String(row.hour), label: `${String(row.hour).padStart(2, "0")}:00`, order: row.hour }];
    case "weekday":
      return [{ key: String(row.weekday), label: WEEKDAY_LABELS[row.weekday] ?? "?", order: row.weekday }];
    case "direction":
      return [{ key: t.direction, label: t.direction === "LONG" ? "Long" : "Short" }];
    case "emotion":
      return row.emotions.map((e) => ({ key: e.toLowerCase(), label: e }));
    case "ruleAdherence":
      return [{ key: row.ruleAdherence, label: ADHERENCE_LABELS[row.ruleAdherence], order: ["CLEAN", "VIOLATED", "UNCHECKED"].indexOf(row.ruleAdherence) }];
    case "quality":
      return [
        {
          key: row.quality.grade ?? "none",
          label: row.quality.grade ? `Grade ${row.quality.grade}` : "Not scored",
          order: row.quality.grade ? "ABCDF".indexOf(row.quality.grade) : 9,
        },
      ];
    case "condition":
      return row.conditionTags.map((c) => ({ key: c, label: c }));
    case "forecastAdherence":
      return [
        {
          key: row.forecastAdherence,
          label: FORECAST_LABELS[row.forecastAdherence],
          order: ["YES", "PARTIAL", "NO", "UNPLANNED", "UNLINKED"].indexOf(row.forecastAdherence),
        },
      ];
  }
}

export function breakdown(rows: readonly AnalyticsRow[], dimension: Dimension): BreakdownGroup[] {
  const groups = new Map<string, { key: Key; rows: AnalyticsRow[] }>();
  for (const row of rows) {
    for (const key of keysFor(row, dimension)) {
      const g = groups.get(key.key) ?? { key, rows: [] };
      g.rows.push(row);
      groups.set(key.key, g);
    }
  }
  const entries = [...groups.values()].map(({ key, rows: groupRows }) => {
    const checked = groupRows.filter((r) => r.ruleChecks > 0);
    const group: BreakdownGroup = {
      key: key.key,
      label: key.label,
      stats: groupStats(groupRows),
      violationRate: checked.length ? checked.filter((r) => r.violations > 0).length / checked.length : null,
      tradeIds: groupRows.map((r) => r.trade.id),
    };
    return { group, order: key.order };
  });
  const natural = entries.every((e) => e.order !== undefined);
  entries.sort((a, b) =>
    natural
      ? a.order! - b.order!
      : b.group.stats.count - a.group.stats.count || a.group.label.localeCompare(b.group.label),
  );
  return entries.map((e) => e.group);
}
