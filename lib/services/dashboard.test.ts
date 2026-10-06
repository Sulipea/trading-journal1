import { describe, expect, it } from "vitest";
import { newId } from "@/lib/domain/ids";
import type { Trade, TradeEvent } from "@/lib/domain/types";
import { buildDashboardSummary, calendarDay } from "./dashboard";

const TZ = "America/New_York";

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: newId(),
    createdAt: "2026-10-01T13:30:00.000Z",
    updatedAt: "2026-10-01T13:30:00.000Z",
    status: "CLOSED",
    symbol: "ESZ6",
    root: "ES",
    direction: "LONG",
    plannedEntry: 5000,
    plannedStop: 4995,
    plannedTarget: null,
    plannedContracts: 1,
    finalStop: null,
    finalTarget: null,
    fees: 0,
    notes: "",
    openedAt: "2026-10-01T13:30:00.000Z",
    closedAt: "2026-10-01T14:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function fills(tradeId: string, entryPx: number, exitPx: number): TradeEvent[] {
  const base = { createdAt: "2026-10-01T13:30:00.000Z", updatedAt: "2026-10-01T13:30:00.000Z", tradeId, quantity: 1, reason: "", notes: "" };
  return [
    { ...base, id: newId(), type: "ENTRY", price: entryPx, timestamp: "2026-10-01T13:30:00.000Z" },
    { ...base, id: newId(), type: "EXIT", price: exitPx, timestamp: "2026-10-01T14:00:00.000Z" },
  ];
}

describe("calendarDay", () => {
  it("uses the configured timezone", () => {
    // 02:00 UTC on the 7th is still the 6th in New York.
    expect(calendarDay("2026-10-07T02:00:00.000Z", TZ)).toBe("2026-10-06");
    expect(calendarDay("2026-10-07T02:00:00.000Z", "UTC")).toBe("2026-10-07");
  });
});

describe("buildDashboardSummary", () => {
  it("summarizes today's activity, equity and drawdown", () => {
    const yesterdayWin = trade({});
    const todayLoss = trade({
      openedAt: "2026-10-06T14:00:00.000Z",
      closedAt: "2026-10-06T15:00:00.000Z",
      fees: 5,
    });
    const todayOpen = trade({ status: "OPEN", openedAt: "2026-10-06T16:00:00.000Z", closedAt: null });
    const trashed = trade({ deletedAt: "2026-10-06T17:00:00.000Z" });

    const events = new Map([
      [yesterdayWin.id, fills(yesterdayWin.id, 5000, 5010)], // +500
      [todayLoss.id, fills(todayLoss.id, 5000, 4996)], // −200 − 5 fees
      [todayOpen.id, []],
      [trashed.id, fills(trashed.id, 5000, 5100)],
    ]);

    const s = buildDashboardSummary({
      startingBalance: 10_000,
      trades: [yesterdayWin, todayLoss, todayOpen, trashed],
      eventsByTrade: events,
      now: new Date("2026-10-06T18:00:00.000Z"),
      timezone: TZ,
    });

    expect(s.todayTradeCount).toBe(2);
    expect(s.todayNetPnl).toBe(-205);
    expect(s.openTradeCount).toBe(1);
    expect(s.performance.tradeCount).toBe(2);
    expect(s.drawdown.currentEquity).toBe(10_295);
    expect(s.drawdown.currentDrawdown).toBe(205);
  });

  it("handles an empty journal", () => {
    const s = buildDashboardSummary({
      startingBalance: 5_000,
      trades: [],
      eventsByTrade: new Map(),
      now: new Date("2026-10-06T18:00:00.000Z"),
      timezone: TZ,
    });
    expect(s.todayTradeCount).toBe(0);
    expect(s.drawdown.currentEquity).toBe(5_000);
    expect(s.performance.winRate).toBeNull();
  });
});
