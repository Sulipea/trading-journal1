import { detectAutoViolations, disciplineConflict, type PriceZone } from "@/lib/calculations/process-checks";
import { computeTradeQuality, type TradeQuality } from "@/lib/calculations/quality";
import { revisionActiveAt } from "@/lib/domain/forecast";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type { ForecastRevision, ForecastTradeLink, PsychologyEntry, RuleCheck, Trade, TradeEvent } from "@/lib/domain/types";
import type { TradeMetrics } from "./trade-metrics";

/** Everything beyond the trade itself that the data-derived checks look at. */
export interface QualityContext {
  events: readonly TradeEvent[];
  link: ForecastTradeLink | null;
  /** Revisions of the linked forecast (others are ignored). */
  revisions: readonly ForecastRevision[];
  psychology: readonly PsychologyEntry[];
}

const EMPTY_CONTEXT: QualityContext = { events: [], link: null, revisions: [], psychology: [] };

/** Entry zones (levels with a range) of the scenario the trade is linked to, at the revision active at entry. */
export function scenarioZones(trade: Trade, link: ForecastTradeLink | null, revisions: readonly ForecastRevision[]): PriceZone[] {
  if (!link?.planned || !link.forecastId || !link.scenarioId) return [];
  const own = revisions.filter((r) => r.forecastId === link.forecastId);
  const revision = own.find((r) => r.id === link.revisionIdAtEntry) ?? revisionActiveAt(own, trade.openedAt);
  const scenario = revision?.content.scenarios.find((s) => s.id === link.scenarioId);
  if (!revision || !scenario) return [];
  return revision.content.keyLevels
    .filter((l) => l.scenarioId === scenario.id || scenario.levelIds.includes(l.id))
    .filter((l) => l.instruments.length === 0 || l.instruments.includes(trade.root))
    .filter((l) => l.priceTo !== null)
    .map((l) => ({ low: Math.min(l.price, l.priceTo!), high: Math.max(l.price, l.priceTo!), label: l.label }));
}

/** Trade quality from the trade, its derived metrics, rule checks and context. Always derived, never stored. */
export function qualityForTrade(
  trade: Trade,
  metrics: TradeMetrics,
  checks: readonly RuleCheck[],
  context: QualityContext = EMPTY_CONTEXT,
): TradeQuality {
  const flat = metrics.fills?.isFlat ?? false;
  const rMultiple = flat ? metrics.rMultiple : null;
  const netPnl = flat ? (metrics.fills?.netPnl ?? null) : null;
  const autoViolations = detectAutoViolations({
    direction: trade.direction,
    tickSize: CONTRACT_SPECS[trade.root].tickSize,
    stopAtEntry: trade.stopAtEntry,
    plannedStop: trade.plannedStop,
    plannedRisk: metrics.plannedRisk,
    rMultiple,
    netPnl,
    averageEntry: metrics.fills?.averageEntry ?? null,
    exitPrices: context.events.filter((e) => e.type === "EXIT").map((e) => e.price),
    zones: scenarioZones(trade, context.link, context.revisions),
  });
  const conflict = disciplineConflict(context.psychology);
  return computeTradeQuality(
    {
      checks,
      overrideCount: trade.requirementOverrides.length,
      autoViolations,
      stopAtEntry: trade.stopAtEntry,
      executionRating: trade.executionRating,
      plannedStop: trade.plannedStop,
      plannedRisk: metrics.plannedRisk,
      actualRisk: metrics.actualRisk,
      plannedContracts: trade.plannedContracts,
      maxOpenQuantity: metrics.fills?.maxOpenQuantity ?? null,
      rMultiple,
      netPnl,
    },
    conflict ? [conflict] : [],
  );
}
