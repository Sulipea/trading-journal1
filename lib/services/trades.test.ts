import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import type { Trade } from "@/lib/domain/types";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import {
  TradeServiceError,
  addFill,
  closeTrade,
  createQuickTrade,
  deleteFill,
  loadTradeWorkspace,
  moveToTrash,
  permanentlyDelete,
  restoreFromTrash,
  savePsychology,
  setUnlocked,
  updateFill,
  updateTrade,
  type FillInput,
} from "./trades";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(async () => {
  db = new JournalDb(`trades-test-${newId()}`);
  repos = createDexieRepositories(db);
  // Keep close requirements small and explicit for these tests.
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, requiredFields: ["plannedStop", "psychologyAfter"] });
});

afterEach(async () => {
  await db.delete();
});

const at = (minute: number) => `2026-10-06T14:${String(minute).padStart(2, "0")}:00.000Z`;

function exitFill(price: number, quantity: number, minute: number): FillInput {
  return { type: "EXIT", price, quantity, timestamp: at(minute), reason: "", notes: "" };
}

async function expectError(promise: Promise<unknown>, code: TradeServiceError["code"]) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof TradeServiceError && e.code === code,
  );
}

async function openTrade(contracts = 2): Promise<Trade> {
  return createQuickTrade(repos, {
    symbol: "esz6",
    direction: "LONG",
    entryPrice: 5000,
    contracts,
    timestamp: at(0),
  });
}

/** Opens, exits and completes a trade, then closes it. */
async function closedTrade(): Promise<Trade> {
  const trade = await openTrade(1);
  await addFill(repos, trade.id, exitFill(5010, 1, 30));
  await updateTrade(repos, trade.id, { plannedStop: 4995 });
  await savePsychology(repos, trade.id, "AFTER", { emotions: ["Calm"], ratings: {}, text: "" });
  return closeTrade(repos, trade.id);
}

describe("quick entry", () => {
  it("creates an open trade with its initial entry fill", async () => {
    const trade = await openTrade();
    expect(trade).toMatchObject({ status: "OPEN", symbol: "ESZ6", root: "ES", plannedContracts: 2 });

    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.events).toHaveLength(1);
    expect(ws.events[0]).toMatchObject({ type: "ENTRY", price: 5000, quantity: 2 });
  });

  it("rejects unsupported symbols", async () => {
    await expectError(
      createQuickTrade(repos, { symbol: "CLZ6", direction: "LONG", entryPrice: 70, contracts: 1, timestamp: at(0) }),
      "INVALID_SYMBOL",
    );
  });
});

describe("fills", () => {
  it("records partial exits and moves the trade to UPDATED", async () => {
    const trade = await openTrade();
    await addFill(repos, trade.id, exitFill(5004, 1, 10));

    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.trade.status).toBe("UPDATED");
    expect(ws.metrics.fills?.openQuantity).toBe(1);
    expect(ws.metrics.fills?.grossPnl).toBe(200);
    expect(ws.history.map((h) => h.field)).toContain("fill.added");
  });

  it("rejects exits larger than the open position", async () => {
    const trade = await openTrade(1);
    await expectError(addFill(repos, trade.id, exitFill(5010, 2, 10)), "INVALID_FILLS");
    expect((await loadTradeWorkspace(repos, trade.id)).events).toHaveLength(1);
  });

  it("validates edits to existing fills", async () => {
    const trade = await openTrade(2);
    const exit = await addFill(repos, trade.id, exitFill(5010, 1, 10));
    await updateFill(repos, exit.id, { price: 5012 });
    await expectError(updateFill(repos, exit.id, { quantity: 3 }), "INVALID_FILLS");
  });

  it("will not delete a trade's last entry", async () => {
    const trade = await openTrade();
    const [entry] = (await loadTradeWorkspace(repos, trade.id)).events;
    await expectError(deleteFill(repos, entry!.id), "INVALID_FILLS");
  });
});

describe("closing", () => {
  it("refuses to close while contracts are still open", async () => {
    const trade = await openTrade(2);
    await addFill(repos, trade.id, exitFill(5010, 1, 10));
    await expectError(closeTrade(repos, trade.id), "INCOMPLETE");
  });

  it("refuses to close with required fields missing and reports them", async () => {
    const trade = await openTrade(1);
    await addFill(repos, trade.id, exitFill(5010, 1, 10));
    const error = await closeTrade(repos, trade.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TradeServiceError);
    expect((error as TradeServiceError).missing).toEqual(["plannedStop", "psychologyAfter"]);
  });

  it("closes a flat, complete trade at the final exit time", async () => {
    const trade = await closedTrade();
    expect(trade.status).toBe("CLOSED");
    expect(trade.closedAt).toBe(at(30));

    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.metrics.fills?.netPnl).toBe(500);
    expect(ws.metrics.rMultiple).toBe(2); // $500 on 1R = $250
    expect(ws.metrics.durationMs).toBe(30 * 60_000);
  });
});

describe("locking and history", () => {
  it("locks important fields and fills after close", async () => {
    const trade = await closedTrade();
    await expectError(updateTrade(repos, trade.id, { fees: 4 }), "LOCKED");
    await expectError(addFill(repos, trade.id, exitFill(5010, 1, 40)), "LOCKED");
    // Non-locked fields stay editable.
    await updateTrade(repos, trade.id, { notes: "Reviewed" });
  });

  it("allows edits after a manual unlock and records old and new values", async () => {
    const trade = await closedTrade();
    await setUnlocked(repos, trade.id, true);
    await updateTrade(repos, trade.id, { fees: 4.5 });

    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.trade.fees).toBe(4.5);
    expect(ws.metrics.fills?.netPnl).toBe(495.5);
    const feeChange = ws.history.find((h) => h.field === "fees");
    expect(feeChange).toMatchObject({ oldValue: 0, newValue: 4.5 });
  });

  it("keeps closed trades complete and flat", async () => {
    const trade = await closedTrade();
    await setUnlocked(repos, trade.id, true);
    await expectError(updateTrade(repos, trade.id, { plannedStop: null }), "INCOMPLETE");
    await expectError(
      addFill(repos, trade.id, { ...exitFill(5010, 1, 40), type: "ENTRY" }),
      "INVALID_FILLS",
    );
    await expectError(
      savePsychology(repos, trade.id, "AFTER", { emotions: [], ratings: {}, text: "" }),
      "INCOMPLETE",
    );
  });

  it("only locks and unlocks closed trades", async () => {
    const trade = await openTrade();
    await expectError(setUnlocked(repos, trade.id, true), "NOT_CLOSED");
  });
});

describe("trash", () => {
  it("moves trades to the trash and restores them", async () => {
    const trade = await openTrade();
    await moveToTrash(repos, trade.id);
    expect(await repos.trades.list()).toHaveLength(0);
    expect(await repos.trash.list()).toHaveLength(1);
    await expectError(updateTrade(repos, trade.id, { notes: "x" }), "IN_TRASH");

    await restoreFromTrash(repos, trade.id);
    expect(await repos.trades.list()).toHaveLength(1);
    expect(await repos.trash.list()).toHaveLength(0);
  });

  it("only permanently deletes trashed trades, and removes everything attached", async () => {
    const trade = await closedTrade();
    await expectError(permanentlyDelete(repos, trade.id), "NOT_IN_TRASH");

    await moveToTrash(repos, trade.id);
    await permanentlyDelete(repos, trade.id);

    expect(await repos.trades.get(trade.id)).toBeUndefined();
    expect(await repos.tradeEvents.listForTrade(trade.id)).toEqual([]);
    expect(await repos.psychology.listForTrade(trade.id)).toEqual([]);
    expect(await repos.changeHistory.listForEntity("trade", trade.id)).toEqual([]);
    expect(await repos.trash.list()).toEqual([]);
  });
});
