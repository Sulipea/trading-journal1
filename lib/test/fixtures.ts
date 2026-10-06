/** Builders for test data. Test-only. */
import { newId } from "@/lib/domain/ids";
import type { Trade, TradeEvent } from "@/lib/domain/types";

export const T0 = "2026-10-06T14:00:00.000Z";

export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: newId(),
    createdAt: T0,
    updatedAt: T0,
    status: "OPEN",
    symbol: "ESZ6",
    root: "ES",
    direction: "LONG",
    session: null,
    marketConditions: "",
    reasoning: "",
    plannedEntry: 5000,
    plannedStop: 4995,
    plannedTarget: null,
    plannedContracts: 1,
    finalStop: null,
    finalTarget: null,
    fees: 0,
    executionNotes: "",
    executionRating: null,
    notes: "",
    openedAt: T0,
    closedAt: null,
    unlocked: false,
    deletedAt: null,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<TradeEvent> & Pick<TradeEvent, "tradeId">): TradeEvent {
  return {
    id: newId(),
    createdAt: T0,
    updatedAt: T0,
    type: "ENTRY",
    price: 5000,
    quantity: 1,
    timestamp: T0,
    reason: "",
    notes: "",
    ...overrides,
  };
}
