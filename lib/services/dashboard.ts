/**
 * Builds the dashboard summary (spec §5) from journal data.
 * Pure: callers load data through repositories and pass `now` explicitly.
 */
import {
  drawdown,
  summarizePerformance,
  type ClosedTradeResult,
  type DrawdownSummary,
  type PerformanceSummary,
} from "@/lib/calculations/performance";
import { roundMoney } from "@/lib/calculations/money";
import { summarizeFills } from "@/lib/calculations/trade";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type { EntityId, Trade, TradeEvent } from "@/lib/domain/types";

export interface DashboardInput {
  startingBalance: number;
  /** All non-deleted trades. */
  trades: readonly Trade[];
  eventsByTrade: ReadonlyMap<EntityId, readonly TradeEvent[]>;
  now: Date;
  timezone: string;
}

export interface DashboardSummary {
  todayTradeCount: number;
  todayNetPnl: number;
  openTradeCount: number;
  performance: PerformanceSummary;
  drawdown: DrawdownSummary;
}

/** Calendar day (YYYY-MM-DD) of an instant in the given timezone. */
export function calendarDay(instant: Date | string, timezone: string): string {
  let formatter = dayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timezone, formatter);
  }
  return formatter.format(typeof instant === "string" ? new Date(instant) : instant);
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Net P&L of a closed trade from its fills, or `null` if it is not closed and flat. */
export function closedTradeResult(
  trade: Trade,
  events: readonly TradeEvent[],
): ClosedTradeResult | null {
  if (trade.status !== "CLOSED" || trade.closedAt === null || trade.deletedAt !== null) {
    return null;
  }
  const summary = summarizeFills(events, trade.direction, CONTRACT_SPECS[trade.root], trade.fees);
  if (!summary.isFlat) return null;
  return { netPnl: summary.netPnl, closedAt: trade.closedAt };
}

export function buildDashboardSummary(input: DashboardInput): DashboardSummary {
  const today = calendarDay(input.now, input.timezone);
  const active = input.trades.filter((t) => t.deletedAt === null);

  const closedResults: ClosedTradeResult[] = [];
  for (const trade of active) {
    const result = closedTradeResult(trade, input.eventsByTrade.get(trade.id) ?? []);
    if (result) closedResults.push(result);
  }

  const todayNetPnl = closedResults
    .filter((r) => calendarDay(r.closedAt, input.timezone) === today)
    .reduce((sum, r) => sum + r.netPnl, 0);

  return {
    todayTradeCount: active.filter((t) => calendarDay(t.openedAt, input.timezone) === today).length,
    todayNetPnl: roundMoney(todayNetPnl),
    openTradeCount: active.filter((t) => t.status !== "CLOSED").length,
    performance: summarizePerformance(closedResults),
    drawdown: drawdown(input.startingBalance, closedResults),
  };
}
