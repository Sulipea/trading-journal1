import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { SCHEMA_VERSION } from "@/lib/db/migrations";
import { newId } from "@/lib/domain/ids";
import type { Trade, TradeEvent } from "@/lib/domain/types";
import { createDexieRepositories } from "./dexie";
import type { JournalRepositories } from "./types";

const T0 = "2026-10-06T14:00:00.000Z";

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: newId(),
    createdAt: T0,
    updatedAt: T0,
    status: "OPEN",
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
    openedAt: T0,
    closedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeEvent(tradeId: string, timestamp: string): TradeEvent {
  return {
    id: newId(),
    createdAt: T0,
    updatedAt: T0,
    tradeId,
    type: "ENTRY",
    price: 5000,
    quantity: 1,
    timestamp,
    reason: "",
    notes: "",
  };
}

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(() => {
  db = new JournalDb(`test-${newId()}`);
  repos = createDexieRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

describe("JournalDb", () => {
  it("opens at the current schema version", async () => {
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
  });
});

describe("TradeRepository", () => {
  it("saves and reads a trade", async () => {
    const trade = makeTrade();
    await repos.trades.save(trade);
    expect(await repos.trades.get(trade.id)).toEqual(trade);
  });

  it("rejects invalid trades at the boundary", async () => {
    await expect(repos.trades.save(makeTrade({ plannedContracts: 0 }))).rejects.toThrow();
    await expect(repos.trades.save(makeTrade({ id: "not-a-uuid" }))).rejects.toThrow();
    expect(await db.trades.count()).toBe(0);
  });

  it("lists newest first and hides trashed trades by default", async () => {
    const older = makeTrade({ openedAt: "2026-10-01T14:00:00.000Z" });
    const newer = makeTrade({ openedAt: "2026-10-05T14:00:00.000Z" });
    const trashed = makeTrade({ deletedAt: T0 });
    for (const t of [older, newer, trashed]) await repos.trades.save(t);

    expect((await repos.trades.list()).map((t) => t.id)).toEqual([newer.id, older.id]);
    expect(await repos.trades.list({ includeDeleted: true })).toHaveLength(3);
  });

  it("lists closed, non-deleted trades oldest close first", async () => {
    const late = makeTrade({ status: "CLOSED", closedAt: "2026-10-03T20:00:00.000Z" });
    const early = makeTrade({ status: "CLOSED", closedAt: "2026-10-02T20:00:00.000Z" });
    const open = makeTrade();
    const trashed = makeTrade({ status: "CLOSED", closedAt: T0, deletedAt: T0 });
    for (const t of [late, early, open, trashed]) await repos.trades.save(t);

    expect((await repos.trades.listClosed()).map((t) => t.id)).toEqual([early.id, late.id]);
  });
});

describe("TradeEventRepository", () => {
  it("returns a trade's events in chronological order", async () => {
    const tradeId = newId();
    const second = makeEvent(tradeId, "2026-10-06T14:10:00.000Z");
    const first = makeEvent(tradeId, "2026-10-06T14:05:00.000Z");
    await repos.tradeEvents.save(second);
    await repos.tradeEvents.save(first);
    await repos.tradeEvents.save(makeEvent(newId(), T0));

    expect((await repos.tradeEvents.listForTrade(tradeId)).map((e) => e.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("groups events for several trades", async () => {
    const a = newId();
    const b = newId();
    await repos.tradeEvents.save(makeEvent(a, T0));
    await repos.tradeEvents.save(makeEvent(b, T0));
    await repos.tradeEvents.save(makeEvent(b, "2026-10-06T15:00:00.000Z"));

    const grouped = await repos.tradeEvents.listForTrades([a, b, newId()]);
    expect(grouped.get(a)).toHaveLength(1);
    expect(grouped.get(b)).toHaveLength(2);
    expect(grouped.size).toBe(3);
  });
});

describe("SettingsRepository", () => {
  it("returns defaults until settings are saved", async () => {
    expect((await repos.settings.getAccount()).startingBalance).toBe(0);
    expect((await repos.settings.getApp()).aiStatus).toBe("NOT_CONFIGURED");
  });

  it("persists account settings", async () => {
    const account = await repos.settings.getAccount();
    await repos.settings.saveAccount({ ...account, startingBalance: 25_000 });
    expect((await repos.settings.getAccount()).startingBalance).toBe(25_000);
  });
});
