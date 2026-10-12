import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { breakdown } from "@/lib/analytics/breakdowns";
import { DEFAULT_FILTER, applyFilter } from "@/lib/analytics/filters";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import { loadAnalyticsDataset } from "./analytics";
import {
  addFill,
  closeTrade,
  createQuickTrade,
  loadTradeWorkspace,
  savePsychology,
  setUnlocked,
  updateTrade,
  type QuickTradeInput,
} from "./trades";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(async () => {
  db = new JournalDb(`trade-context-test-${newId()}`);
  repos = createDexieRepositories(db);
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, requiredFields: ["plannedStop"] });
});

afterEach(async () => {
  await db.delete();
});

const at = (minute: number) => `2026-10-06T14:${String(minute).padStart(2, "0")}:00.000Z`;

/** A closed 1-contract ES long: entry 5000, stop 4995 (1R = $250), exit at `exit`. */
async function closedTrade(exit: number, context: Partial<QuickTradeInput> = {}) {
  const trade = await createQuickTrade(repos, {
    symbol: "ESZ6",
    direction: "LONG",
    entryPrice: 5000,
    contracts: 1,
    timestamp: at(0),
    ...context,
  });
  await updateTrade(repos, trade.id, { plannedStop: 4995 });
  await addFill(repos, trade.id, { type: "EXIT", price: exit, quantity: 1, timestamp: at(30), reason: "", notes: "" });
  await savePsychology(repos, trade.id, "AFTER", { emotions: [], ratings: {}, text: "" });
  return closeTrade(repos, trade.id);
}

describe("news and VIX context", () => {
  it("is recorded on quick entry and stays empty when not given", async () => {
    const withContext = await createQuickTrade(repos, {
      symbol: "ESZ6",
      direction: "LONG",
      entryPrice: 5000,
      contracts: 1,
      timestamp: at(0),
      newsDay: true,
      newsEvent: " CPI ",
      vixLevel: 16.4,
      vixDirection: "SUPPORTING",
    });
    expect(withContext).toMatchObject({ newsDay: true, newsEvent: "CPI", vixLevel: 16.4, vixDirection: "SUPPORTING" });

    const without = await createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: at(1) });
    expect(without).toMatchObject({ newsDay: null, newsEvent: "", vixLevel: null, vixDirection: null, rMultipleOverride: null });
  });

  it("stays editable after close, and clears the event name when it isn't a news day", async () => {
    const trade = await closedTrade(5010, { newsDay: true, newsEvent: "FOMC" });
    await updateTrade(repos, trade.id, { newsDay: false, vixLevel: 21.15, vixDirection: "AGAINST" });

    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.trade).toMatchObject({ newsDay: false, newsEvent: "", vixLevel: 21.15, vixDirection: "AGAINST" });
    expect(ws.history.find((h) => h.field === "newsEvent")).toMatchObject({ oldValue: "FOMC", newValue: "" });
  });

  it("rejects a negative VIX level", async () => {
    const trade = await createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: at(0) });
    await expect(updateTrade(repos, trade.id, { vixLevel: -1 })).rejects.toThrow();
  });
});

describe("result in R", () => {
  it("is calculated from P&L and risk, and a manual value overrides it", async () => {
    const trade = await closedTrade(5010); // +$500 on 1R = $250
    let ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.metrics.rMultiple).toBe(2);
    expect(ws.metrics.calculatedRMultiple).toBe(2);

    // Like other result fields, it is locked after close until unlocked.
    await expect(updateTrade(repos, trade.id, { rMultipleOverride: -1 })).rejects.toThrow();
    await setUnlocked(repos, trade.id, true);
    await updateTrade(repos, trade.id, { rMultipleOverride: -1 });
    ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.metrics.rMultiple).toBe(-1);
    expect(ws.metrics.calculatedRMultiple).toBe(2);

    // Clearing it goes back to the calculated value.
    await updateTrade(repos, trade.id, { rMultipleOverride: null });
    expect((await loadTradeWorkspace(repos, trade.id)).metrics.rMultiple).toBe(2);
  });

  it("can be entered when there is no planned risk to calculate from", async () => {
    const trade = await closedTrade(5010);
    const settings = await repos.settings.getApp();
    await repos.settings.saveApp({ ...settings, requiredFields: [] });
    await setUnlocked(repos, trade.id, true);
    await updateTrade(repos, trade.id, { plannedStop: null, rMultipleOverride: 1.5 });
    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.metrics.calculatedRMultiple).toBeNull();
    expect(ws.metrics.rMultiple).toBe(1.5);
  });
});

describe("analytics by news day and VIX direction", () => {
  it("groups with win rate and average R, and filters", async () => {
    await closedTrade(5010, { newsDay: true, newsEvent: "CPI", vixDirection: "SUPPORTING" }); // +2R
    await closedTrade(4995, { newsDay: true, vixDirection: "AGAINST" }); // -1R
    await closedTrade(5005, { newsDay: false, vixDirection: "SUPPORTING" }); // +1R
    await closedTrade(5010); // not recorded, +2R

    const { rows, today } = await loadAnalyticsDataset(repos);
    expect(rows).toHaveLength(4);

    const news = breakdown(rows, "newsDay");
    expect(news.map((g) => g.label)).toEqual(["News day", "No news", "Not recorded"]);
    expect(news[0]!.stats).toMatchObject({ count: 2, winRate: 0.5, averageR: 0.5 });
    expect(news[1]!.stats).toMatchObject({ count: 1, winRate: 1, averageR: 1 });

    const vix = breakdown(rows, "vixDirection");
    expect(vix.map((g) => g.label)).toEqual(["Supporting", "Against", "Not recorded"]);
    expect(vix[0]!.stats).toMatchObject({ count: 2, winRate: 1, averageR: 1.5 });
    expect(vix[1]!.stats).toMatchObject({ count: 1, winRate: 0, averageR: -1 });

    const only = (patch: Partial<typeof DEFAULT_FILTER>) => applyFilter(rows, { ...DEFAULT_FILTER, ...patch }, today).length;
    expect(only({ newsDay: "YES" })).toBe(2);
    expect(only({ newsDay: "NO" })).toBe(1);
    expect(only({ vixDirections: ["SUPPORTING"] })).toBe(2);
    expect(only({ vixDirections: ["NEUTRAL"] })).toBe(0);
    expect(only({ newsDay: "YES", vixDirections: ["AGAINST"] })).toBe(1);
  });
});
