/**
 * Pattern detection (spec §20). Compares each group of trades (a setup, an
 * hour, an emotion, …) with all other trades and surfaces only differences
 * that are both supported by enough trades and unlikely to be noise.
 *
 * Everything returned is a *potential* pattern: a correlation in your own
 * history, never evidence of cause. With many groups tested, some will look
 * significant by chance — supporting trades are always attached so the
 * evidence can be checked.
 */
import type { EntityId } from "@/lib/domain/types";
import { breakdown, DIMENSION_LABELS, type Dimension } from "./breakdowns";
import type { AnalyticsRow } from "./dataset";
import { groupStats, type GroupStats } from "./stats";

/** Each side of a comparison needs at least this many trades. */
export const MIN_PATTERN_GROUP = 10;
/** No pattern detection below this many closed trades in view. */
export const MIN_PATTERN_TRADES = 2 * MIN_PATTERN_GROUP;
/** |t| or |z| at or above this (≈ p < 0.05, two-sided). */
export const PATTERN_THRESHOLD = 2;
const MAX_PATTERNS = 12;

const DIMENSIONS: Dimension[] = [
  "setup",
  "instrument",
  "session",
  "hour",
  "weekday",
  "direction",
  "emotion",
  "ruleAdherence",
  "quality",
  "condition",
  "forecastAdherence",
];

export interface Pattern {
  id: string;
  dimension: Dimension;
  groupKey: string;
  groupLabel: string;
  metric: "EXPECTANCY" | "WIN_RATE";
  direction: "BETTER" | "WORSE";
  /** Test statistic (Welch t for expectancy, two-proportion z for win rate). */
  statistic: number;
  group: GroupStats;
  rest: GroupStats;
  statement: string;
  tradeIds: EntityId[];
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: readonly number[]): number {
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Welch's t statistic for a difference in means; 0 when undefined. */
export function welchT(a: readonly number[], b: readonly number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  if (se === 0) return 0;
  return (mean(a) - mean(b)) / se;
}

/** Two-proportion z statistic; 0 when undefined. */
export function proportionZ(winsA: number, nA: number, winsB: number, nB: number): number {
  if (nA === 0 || nB === 0) return 0;
  const p = (winsA + winsB) / (nA + nB);
  const se = Math.sqrt(p * (1 - p) * (1 / nA + 1 / nB));
  if (se === 0) return 0;
  return (winsA / nA - winsB / nB) / se;
}

const money = (v: number | null) =>
  v === null ? "—" : `${v < 0 ? "-" : "+"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function describeGroup(dimension: Dimension, label: string): string {
  switch (dimension) {
    case "emotion":
      return `trades where you felt "${label}"`;
    case "hour":
      return `trades entered at ${label}`;
    case "weekday":
      return `trades on ${label}s`;
    case "condition":
      return `trades in "${label}" conditions`;
    default:
      return `${DIMENSION_LABELS[dimension].toLowerCase()} "${label}" trades`;
  }
}

export function detectPatterns(rows: readonly AnalyticsRow[]): Pattern[] {
  if (rows.length < MIN_PATTERN_TRADES) return [];
  const patterns: Pattern[] = [];
  // A group and its exact complement (e.g. Long vs Short) are the same finding; report it once.
  const reported = new Set<string>();
  // Filtering an already sorted list keeps it sorted, so signatures need no per-group sort.
  const sortedIds = rows.map((r) => r.trade.id).sort();
  const signature = (keep: (id: string) => boolean) => sortedIds.filter(keep).join(",");

  for (const dimension of DIMENSIONS) {
    // Smallest groups first: when two groups mirror each other, the more specific one is reported.
    const groups = breakdown(rows, dimension).sort((a, b) => a.tradeIds.length - b.tradeIds.length);
    for (const g of groups) {
      const inGroup = new Set(g.tradeIds);
      const groupRows = rows.filter((r) => inGroup.has(r.trade.id));
      const restRows = rows.filter((r) => !inGroup.has(r.trade.id));
      if (groupRows.length < MIN_PATTERN_GROUP || restRows.length < MIN_PATTERN_GROUP) continue;
      if (reported.has(signature((id) => !inGroup.has(id)))) continue;
      const countBefore = patterns.length;

      const group = groupStats(groupRows);
      const rest = groupStats(restRows);
      const who = describeGroup(dimension, g.label);
      const base = { dimension, groupKey: g.key, groupLabel: g.label, group, rest, tradeIds: g.tradeIds };

      const t = welchT(
        groupRows.map((r) => r.netPnl),
        restRows.map((r) => r.netPnl),
      );
      if (Math.abs(t) >= PATTERN_THRESHOLD) {
        patterns.push({
          ...base,
          id: `${dimension}:${g.key}:expectancy`,
          metric: "EXPECTANCY",
          direction: t > 0 ? "BETTER" : "WORSE",
          statistic: t,
          statement: `Potential pattern: ${who} averaged ${money(group.expectancy)} per trade vs ${money(rest.expectancy)} for your other trades.`,
        });
        reported.add(signature((id) => inGroup.has(id)));
        continue; // one pattern per group is enough
      }

      const winsA = groupRows.filter((r) => r.netPnl > 0).length;
      const winsB = restRows.filter((r) => r.netPnl > 0).length;
      const z = proportionZ(winsA, groupRows.length, winsB, restRows.length);
      if (Math.abs(z) >= PATTERN_THRESHOLD) {
        patterns.push({
          ...base,
          id: `${dimension}:${g.key}:winrate`,
          metric: "WIN_RATE",
          direction: z > 0 ? "BETTER" : "WORSE",
          statistic: z,
          statement: `Potential pattern: ${who} won ${pct(group.winRate)} of the time vs ${pct(rest.winRate)} for your other trades.`,
        });
      }
      if (patterns.length > countBefore) reported.add(signature((id) => inGroup.has(id)));
    }
  }

  return patterns.sort((a, b) => Math.abs(b.statistic) - Math.abs(a.statistic)).slice(0, MAX_PATTERNS);
}
