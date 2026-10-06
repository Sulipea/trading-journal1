import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { SCHEMA_VERSION } from "@/lib/db/migrations";
import { newId } from "@/lib/domain/ids";
import { T0, makeEvent as event, makeTrade } from "@/lib/test/fixtures";
import { createDexieRepositories } from "./dexie";
import type { JournalRepositories } from "./types";

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
    const second = event({ tradeId, timestamp: "2026-10-06T14:10:00.000Z" });
    const first = event({ tradeId, timestamp: "2026-10-06T14:05:00.000Z" });
    await repos.tradeEvents.save(second);
    await repos.tradeEvents.save(first);
    await repos.tradeEvents.save(event({ tradeId: newId(), timestamp: T0 }));

    expect((await repos.tradeEvents.listForTrade(tradeId)).map((e) => e.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("groups events for several trades", async () => {
    const a = newId();
    const b = newId();
    await repos.tradeEvents.save(event({ tradeId: a, timestamp: T0 }));
    await repos.tradeEvents.save(event({ tradeId: b, timestamp: T0 }));
    await repos.tradeEvents.save(event({ tradeId: b, timestamp: "2026-10-06T15:00:00.000Z" }));

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

describe("PsychologyRepository", () => {
  it("allows only one entry per trade and phase", async () => {
    const tradeId = newId();
    const entry = {
      id: newId(),
      createdAt: T0,
      updatedAt: T0,
      tradeId,
      phase: "BEFORE" as const,
      emotions: ["Calm"],
      ratings: { Focus: 4 },
      text: "",
    };
    await repos.psychology.save(entry);
    await expect(repos.psychology.save({ ...entry, id: newId() })).rejects.toThrow();
    await repos.psychology.save({ ...entry, id: newId(), phase: "AFTER" });
    expect(await repos.psychology.listForTrade(tradeId)).toHaveLength(2);
  });

  it("rejects ratings outside 1–5", async () => {
    await expect(
      repos.psychology.save({
        id: newId(),
        createdAt: T0,
        updatedAt: T0,
        tradeId: newId(),
        phase: "DURING",
        emotions: [],
        ratings: { Focus: 6 },
        text: "",
      }),
    ).rejects.toThrow();
  });
});

describe("ChangeHistoryRepository", () => {
  it("lists an entity's changes newest first", async () => {
    const entityId = newId();
    const change = (field: string, changedAt: string) => ({
      id: newId(),
      createdAt: changedAt,
      updatedAt: changedAt,
      entityType: "trade",
      entityId,
      field,
      oldValue: 1,
      newValue: 2,
      changedAt,
    });
    await repos.changeHistory.add([
      change("fees", "2026-10-06T14:00:00.000Z"),
      change("notes", "2026-10-06T15:00:00.000Z"),
    ]);
    expect((await repos.changeHistory.listForEntity("trade", entityId)).map((c) => c.field)).toEqual([
      "notes",
      "fees",
    ]);
  });
});

describe("transaction", () => {
  it("rolls back every write when the work fails", async () => {
    const trade = makeTrade();
    await expect(
      repos.transaction(async () => {
        await repos.trades.save(trade);
        await repos.tradeEvents.save(event({ tradeId: trade.id }));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await repos.trades.get(trade.id)).toBeUndefined();
    expect(await repos.tradeEvents.listForTrade(trade.id)).toEqual([]);
  });
});
