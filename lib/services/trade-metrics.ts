/**
 * Derived per-trade metrics. Always computed from source data (trade + fills),
 * never stored as the source of truth.
 */
import {
  FillSequenceError,
  actualRisk,
  plannedRewardRisk,
  plannedRisk,
  rMultiple,
  summarizeFills,
  type FillSummary,
} from "@/lib/calculations/trade";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type { Trade, TradeEvent } from "@/lib/domain/types";

export interface TradeMetrics {
  /** `null` if the fills are inconsistent (see `fillError`). */
  fills: FillSummary | null;
  fillError: string | null;
  /** Initial planned risk in dollars (1R). */
  plannedRisk: number | null;
  plannedRewardRisk: number | null;
  actualRisk: number | null;
  /** P&L calculated from the fills, even when a manual override replaces it in `fills.netPnl`. */
  calculatedNetPnl: number | null;
  /** Only once the position is flat. */
  rMultiple: number | null;
  /** First entry to final exit, once flat. Displayed only; not used in analytics. */
  durationMs: number | null;
}

export function computeTradeMetrics(trade: Trade, events: readonly TradeEvent[]): TradeMetrics {
  const spec = CONTRACT_SPECS[trade.root];
  const risk = plannedRisk(spec, trade.plannedEntry, trade.plannedStop, trade.plannedContracts);

  let fills: FillSummary | null = null;
  let fillError: string | null = null;
  try {
    fills = summarizeFills(events, trade.direction, spec, trade.fees);
  } catch (error) {
    if (!(error instanceof FillSequenceError)) throw error;
    fillError = error.message;
  }

  const calculatedNetPnl = fills?.netPnl ?? null;
  // A manual net P&L applies once the trade is flat, and flows into R, quality and analytics.
  if (fills?.isFlat && trade.netPnlOverride !== null) fills = { ...fills, netPnl: trade.netPnlOverride };

  let durationMs: number | null = null;
  if (fills?.isFlat) {
    const times = events.map((e) => Date.parse(e.timestamp));
    durationMs = Math.max(...times) - Math.min(...times);
  }

  return {
    fills,
    fillError,
    plannedRisk: risk,
    plannedRewardRisk: plannedRewardRisk(trade.plannedEntry, trade.plannedStop, trade.plannedTarget),
    actualRisk: fills ? actualRisk(spec, fills, trade.finalStop ?? trade.plannedStop) : null,
    calculatedNetPnl,
    rMultiple: fills?.isFlat ? rMultiple(fills.netPnl, risk) : null,
    durationMs,
  };
}
