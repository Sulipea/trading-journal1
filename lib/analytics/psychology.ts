/** Psychology analytics (spec §12). Pure. */
import type { PsychologyPhase } from "@/lib/domain/types";
import type { AnalyticsRow } from "./dataset";
import { MIN_SAMPLE } from "./stats";

export interface EmotionFrequency {
  emotion: string;
  /** Closed trades with this emotion in each phase. */
  byPhase: Record<PsychologyPhase, number>;
  /** Closed trades with this emotion in any phase. */
  trades: number;
  share: number;
}

/** How often each emotion appears, per phase. Uses the psychology entries on closed trades. */
export function emotionFrequency(
  rows: readonly AnalyticsRow[],
  entriesByTrade: ReadonlyMap<string, readonly { phase: PsychologyPhase; emotions: readonly string[] }[]>,
): EmotionFrequency[] {
  const map = new Map<string, EmotionFrequency>();
  const key = (e: string) => e.toLowerCase();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const entry of entriesByTrade.get(row.trade.id) ?? []) {
      for (const e of entry.emotions) {
        const f = map.get(key(e)) ?? { emotion: e, byPhase: { BEFORE: 0, DURING: 0, AFTER: 0 }, trades: 0, share: 0 };
        f.byPhase[entry.phase]++;
        if (!seen.has(key(e))) {
          f.trades++;
          seen.add(key(e));
        }
        map.set(key(e), f);
      }
    }
  }
  return [...map.values()]
    .map((f) => ({ ...f, share: rows.length ? f.trades / rows.length : 0 }))
    .sort((a, b) => b.trades - a.trades || a.emotion.localeCompare(b.emotion));
}

export interface RatingComparison {
  phase: PsychologyPhase;
  rating: string;
  winners: { count: number; average: number | null };
  losers: { count: number; average: number | null };
  smallSample: boolean;
}

/** Average psychology ratings on winning vs losing trades. */
export function ratingsVsOutcome(rows: readonly AnalyticsRow[]): RatingComparison[] {
  const acc = new Map<string, { phase: PsychologyPhase; rating: string; win: number[]; loss: number[] }>();
  for (const row of rows) {
    for (const [phase, ratings] of Object.entries(row.ratings) as [PsychologyPhase, Record<string, number>][]) {
      for (const [rating, value] of Object.entries(ratings)) {
        const k = `${phase}|${rating}`;
        const a = acc.get(k) ?? { phase, rating, win: [], loss: [] };
        if (row.netPnl > 0) a.win.push(value);
        else if (row.netPnl < 0) a.loss.push(value);
        acc.set(k, a);
      }
    }
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const phaseOrder: PsychologyPhase[] = ["BEFORE", "DURING", "AFTER"];
  return [...acc.values()]
    .map((a) => ({
      phase: a.phase,
      rating: a.rating,
      winners: { count: a.win.length, average: avg(a.win) },
      losers: { count: a.loss.length, average: avg(a.loss) },
      smallSample: a.win.length + a.loss.length < MIN_SAMPLE,
    }))
    .sort((a, b) => phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) || a.rating.localeCompare(b.rating));
}

export interface EmotionContext {
  context: string;
  trades: number;
  /** Most common emotions in this context, with their share of its trades. */
  top: { emotion: string; share: number }[];
}

/** Which emotions show up in each setup / session / market condition. */
export function emotionsByContext(
  rows: readonly AnalyticsRow[],
  contextOf: (row: AnalyticsRow) => string[],
  limit = 3,
): EmotionContext[] {
  const groups = new Map<string, AnalyticsRow[]>();
  for (const row of rows) for (const c of contextOf(row)) groups.set(c, [...(groups.get(c) ?? []), row]);
  return [...groups]
    .map(([context, groupRows]) => {
      const counts = new Map<string, number>();
      for (const r of groupRows) for (const e of r.emotions) counts.set(e, (counts.get(e) ?? 0) + 1);
      return {
        context,
        trades: groupRows.length,
        top: [...counts]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, limit)
          .map(([emotion, n]) => ({ emotion, share: n / groupRows.length })),
      };
    })
    .filter((g) => g.top.length > 0)
    .sort((a, b) => b.trades - a.trades);
}
