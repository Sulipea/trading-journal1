import { describe, expect, it } from "vitest";
import { drawdown, drawdownSeries, equityCurve, summarizePerformance, type ClosedTradeResult } from "./performance";

const result = (netPnl: number, day: number): ClosedTradeResult => ({
  netPnl,
  closedAt: `2026-10-${String(day).padStart(2, "0")}T20:00:00.000Z`,
});

describe("summarizePerformance", () => {
  it("computes win rate, averages, expectancy and profit factor", () => {
    const s = summarizePerformance([
      result(200, 1),
      result(-100, 2),
      result(0, 3),
      result(300, 4),
      result(-50, 5),
    ]);
    expect(s).toMatchObject({
      tradeCount: 5,
      wins: 2,
      losses: 2,
      breakevens: 1,
      winRate: 0.4,
      grossProfit: 500,
      grossLoss: -150,
      netPnl: 350,
      averageWin: 250,
      averageLoss: -75,
      expectancy: 70,
    });
    expect(s.profitFactor).toBeCloseTo(3.3333, 4);
  });

  it("returns nulls for an empty journal", () => {
    const s = summarizePerformance([]);
    expect(s.tradeCount).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.expectancy).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.averageWin).toBeNull();
  });

  it("has no profit factor when there are no losses", () => {
    expect(summarizePerformance([result(100, 1)]).profitFactor).toBeNull();
  });

  it("rounds sums to cents", () => {
    const s = summarizePerformance([result(0.1, 1), result(0.2, 2)]);
    expect(s.netPnl).toBe(0.3);
  });
});

describe("equityCurve", () => {
  it("starts at the starting balance and accumulates in close order", () => {
    const curve = equityCurve(10_000, [result(-200, 3), result(500, 1)]);
    expect(curve.map((p) => p.equity)).toEqual([10_000, 10_500, 10_300]);
    expect(curve[0]!.at).toBeNull();
  });
});

describe("drawdown", () => {
  it("tracks current and maximum drawdown from the running peak", () => {
    const d = drawdown(10_000, [result(500, 1), result(-800, 2), result(200, 3), result(-100, 4)]);
    // equity: 10000 → 10500 → 9700 → 9900 → 9800
    expect(d.currentEquity).toBe(9800);
    expect(d.peakEquity).toBe(10_500);
    expect(d.currentDrawdown).toBe(700);
    expect(d.maxDrawdown).toBe(800);
    expect(d.maxDrawdownPct).toBeCloseTo(800 / 10_500, 10);
  });

  it("counts the starting balance as the initial peak", () => {
    const d = drawdown(10_000, [result(-300, 1)]);
    expect(d.maxDrawdown).toBe(300);
    expect(d.currentDrawdown).toBe(300);
  });

  it("is zero with no trades", () => {
    const d = drawdown(10_000, []);
    expect(d).toMatchObject({ currentEquity: 10_000, currentDrawdown: 0, maxDrawdown: 0 });
    expect(d.maxDrawdownPct).toBeNull();
  });
});

describe("drawdownSeries", () => {
  it("tracks the running peak and drawdown at every point", () => {
    const series = drawdownSeries(10_000, [result(500, 1), result(-800, 2), result(200, 3)]);
    expect(series.map((p) => [p.equity, p.peak, p.drawdown])).toEqual([
      [10_000, 10_000, 0],
      [10_500, 10_500, 0],
      [9_700, 10_500, 800],
      [9_900, 10_500, 600],
    ]);
  });
});
