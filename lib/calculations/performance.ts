/**
 * Aggregate performance statistics over closed trades (spec §9, §10).
 *
 * Only closed trades count toward performance; callers are responsible for
 * passing closed, non-deleted trades only.
 */
import { roundMoney } from "./money";

export interface ClosedTradeResult {
  netPnl: number;
  closedAt: string;
}

export interface PerformanceSummary {
  tradeCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** Fraction 0–1, or `null` with no trades. */
  winRate: number | null;
  grossProfit: number;
  /** Sum of losing trades, as a negative number. */
  grossLoss: number;
  netPnl: number;
  averageWin: number | null;
  /** Average losing trade, as a negative number. */
  averageLoss: number | null;
  /** Average net P&L per trade, or `null` with no trades. */
  expectancy: number | null;
  /** Gross profit ÷ |gross loss|, or `null` when there are no losses. */
  profitFactor: number | null;
}

export function summarizePerformance(results: readonly ClosedTradeResult[]): PerformanceSummary {
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const { netPnl } of results) {
    if (netPnl > 0) {
      wins += 1;
      grossProfit += netPnl;
    } else if (netPnl < 0) {
      losses += 1;
      grossLoss += netPnl;
    }
  }

  const tradeCount = results.length;
  const netPnl = grossProfit + grossLoss;

  return {
    tradeCount,
    wins,
    losses,
    breakevens: tradeCount - wins - losses,
    winRate: tradeCount > 0 ? wins / tradeCount : null,
    grossProfit: roundMoney(grossProfit),
    grossLoss: roundMoney(grossLoss),
    netPnl: roundMoney(netPnl),
    averageWin: wins > 0 ? roundMoney(grossProfit / wins) : null,
    averageLoss: losses > 0 ? roundMoney(grossLoss / losses) : null,
    expectancy: tradeCount > 0 ? roundMoney(netPnl / tradeCount) : null,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
  };
}

export interface EquityPoint {
  /** `null` for the starting-balance point. */
  at: string | null;
  equity: number;
}

function byCloseTime(results: readonly ClosedTradeResult[]): ClosedTradeResult[] {
  return [...results].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}

/** Equity = starting balance + cumulative closed-trade net P&L, in close order. */
export function equityCurve(
  startingBalance: number,
  results: readonly ClosedTradeResult[],
): EquityPoint[] {
  const points: EquityPoint[] = [{ at: null, equity: roundMoney(startingBalance) }];
  let equity = startingBalance;
  for (const result of byCloseTime(results)) {
    equity += result.netPnl;
    points.push({ at: result.closedAt, equity: roundMoney(equity) });
  }
  return points;
}

export interface DrawdownSummary {
  currentEquity: number;
  peakEquity: number;
  /** Peak-to-current decline in dollars (≥ 0). */
  currentDrawdown: number;
  /** Largest peak-to-trough decline in dollars (≥ 0). */
  maxDrawdown: number;
  /** Largest decline as a fraction of the peak it fell from, or `null` if no positive peak. */
  maxDrawdownPct: number | null;
}

export function drawdown(
  startingBalance: number,
  results: readonly ClosedTradeResult[],
): DrawdownSummary {
  const curve = equityCurve(startingBalance, results);
  let peak = curve[0]!.equity;
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;

  for (const { equity } of curve) {
    if (equity > peak) peak = equity;
    const decline = peak - equity;
    if (decline > maxDrawdown) {
      maxDrawdown = decline;
      maxDrawdownPct = peak > 0 ? decline / peak : null;
    }
  }

  const currentEquity = curve[curve.length - 1]!.equity;
  return {
    currentEquity,
    peakEquity: roundMoney(peak),
    currentDrawdown: roundMoney(peak - currentEquity),
    maxDrawdown: roundMoney(maxDrawdown),
    maxDrawdownPct,
  };
}
