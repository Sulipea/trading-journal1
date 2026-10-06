import { computeTradeQuality, type TradeQuality } from "@/lib/calculations/quality";
import type { RuleCheck, Trade } from "@/lib/domain/types";
import type { TradeMetrics } from "./trade-metrics";

/** Trade quality from the trade, its derived metrics and its rule checks. Always derived, never stored. */
export function qualityForTrade(trade: Trade, metrics: TradeMetrics, checks: readonly RuleCheck[]): TradeQuality {
  const flat = metrics.fills?.isFlat ?? false;
  return computeTradeQuality({
    checks,
    overrideCount: trade.requirementOverrides.length,
    executionRating: trade.executionRating,
    plannedStop: trade.plannedStop,
    plannedRisk: metrics.plannedRisk,
    actualRisk: metrics.actualRisk,
    plannedContracts: trade.plannedContracts,
    maxOpenQuantity: metrics.fills?.maxOpenQuantity ?? null,
    rMultiple: flat ? metrics.rMultiple : null,
    netPnl: flat ? (metrics.fills?.netPnl ?? null) : null,
  });
}
