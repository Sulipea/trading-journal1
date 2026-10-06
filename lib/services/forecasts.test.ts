import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { emptyForecastContent } from "@/lib/domain/forecast";
import { newId } from "@/lib/domain/ids";
import type { ForecastContent, ForecastKeyLevel, ForecastScenario } from "@/lib/domain/types";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import { clearForecastLink, loadTradeForecastContext, setForecastLink } from "./forecast-links";
import { loadForecastWorkspace, loadForecastsOverview } from "./forecast-views";
import {
  ForecastLockedError,
  addMarketSnapshot,
  createForecast,
  createRevision,
  finalizeForecast,
  saveForecastReview,
  saveLevelInteraction,
  setForecastReopened,
  updateDraft,
} from "./forecasts";
import { addFill, closeTrade, createQuickTrade, loadTradeWorkspace, moveToTrash, permanentlyDelete } from "./trades";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(async () => {
  db = new JournalDb(`forecast-test-${newId()}`);
  repos = createDexieRepositories(db);
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, timezone: "UTC", requiredFields: [] });
});

afterEach(async () => {
  await db.delete();
});

const FUTURE = "2099-01-02"; // never locked during tests
const PAST = "2020-01-02"; // always locked

const scenario = (title: string, overrides: Partial<ForecastScenario> = {}): ForecastScenario => ({
  id: newId(),
  title,
  if: "",
  then: "",
  invalidation: "",
  instruments: [],
  setupIds: [],
  levelIds: [],
  confidence: null,
  ...overrides,
});
const level = (price: number, overrides: Partial<ForecastKeyLevel> = {}): ForecastKeyLevel => ({
  id: newId(),
  price,
  priceTo: null,
  instruments: ["ES"],
  label: "",
  type: "SUPPORT",
  priority: "MEDIUM",
  expectedReaction: null,
  expectedNotes: "",
  scenarioId: null,
  ...overrides,
});

async function finalForecast(date: string, content: Partial<ForecastContent> = {}, finalizedAt?: string) {
  const forecast = await createForecast(repos, date, { ...emptyForecastContent(), ...content });
  await finalizeForecast(repos, forecast.id, finalizedAt);
  return forecast;
}

describe("forecast lifecycle", () => {
  it("allows one forecast per day and edits only the draft", async () => {
    const forecast = await createForecast(repos, FUTURE);
    await expect(createForecast(repos, FUTURE)).rejects.toThrow("already a forecast");

    await updateDraft(repos, forecast.id, { ...emptyForecastContent(), bias: "BULLISH" });
    await finalizeForecast(repos, forecast.id);
    await expect(updateDraft(repos, forecast.id, emptyForecastContent())).rejects.toThrow("Create Revision");

    const [original] = await repos.forecasts.listRevisions(forecast.id);
    expect(original).toMatchObject({ number: 0, content: { bias: "BULLISH" } });
    expect(original!.finalizedAt).not.toBeNull();
  });

  it("rejects inconsistent content", async () => {
    await expect(
      createForecast(repos, FUTURE, { ...emptyForecastContent(), scenarios: [scenario("A", { levelIds: [newId()] })] }),
    ).rejects.toThrow("doesn't exist");
  });

  it("revises with a reason, keeps previous revisions and records exact changes", async () => {
    const s = scenario("Gap fill");
    const forecast = await finalForecast(FUTURE, { scenarios: [s] });

    await expect(createRevision(repos, forecast.id, { ...emptyForecastContent(), scenarios: [s] }, "nothing")).rejects.toThrow(
      "Nothing changed",
    );
    await expect(createRevision(repos, forecast.id, emptyForecastContent(), " ")).rejects.toThrow("Explain");

    const revision = await createRevision(
      repos,
      forecast.id,
      { ...emptyForecastContent(), bias: "BEARISH", scenarios: [{ ...s, then: "Fade" }] },
      "Overnight selling",
    );
    expect(revision).toMatchObject({ number: 1, reason: "Overnight selling" });
    expect(revision.changes.map((c) => c.path)).toEqual(["bias", `scenario:${s.id}.then`]);

    const revisions = await repos.forecasts.listRevisions(forecast.id);
    expect(revisions.map((r) => r.content.bias)).toEqual(["NEUTRAL", "BEARISH"]);
    expect((await repos.forecasts.get(forecast.id))!.activeRevisionId).toBe(revision.id);
  });

  it("locks past days, allows manual reopen, and keeps reviews and levels editable", async () => {
    const l = level(5000);
    const forecast = await createForecast(repos, PAST, { ...emptyForecastContent(), keyLevels: [l] });
    await expect(finalizeForecast(repos, forecast.id)).rejects.toBeInstanceOf(ForecastLockedError);

    await setForecastReopened(repos, forecast.id, true);
    await finalizeForecast(repos, forecast.id);
    await setForecastReopened(repos, forecast.id, false);
    await expect(createRevision(repos, forecast.id, { ...emptyForecastContent(), bias: "BULLISH" }, "x")).rejects.toBeInstanceOf(
      ForecastLockedError,
    );

    // Observations after the day are still allowed.
    await saveLevelInteraction(repos, forecast.id, l.id, { touched: true, outcome: "REJECTION", source: "MANUAL", notes: "", tradeIds: [] });
    await saveForecastReview(repos, forecast.id, { actualBias: "BEARISH", actualOutcome: "Sold off", scenarioOutcomes: {}, notes: "" });
    expect((await repos.forecasts.get(forecast.id))!.review?.actualBias).toBe("BEARISH");

    await expect(setForecastReopened(repos, (await createForecast(repos, FUTURE)).id, true)).rejects.toThrow("already open");
  });
});

describe("market-condition snapshots", () => {
  it("keeps the timeline and can revise the active forecast", async () => {
    const forecast = await finalForecast(FUTURE, { marketConditions: "Quiet open" });
    const quiet = await addMarketSnapshot(repos, forecast.id, {
      at: "2099-01-02T14:00:00.000Z",
      conditions: "Still quiet",
      conditionTags: [],
      bias: null,
      notes: "",
      updateForecast: false,
    });
    expect(quiet.revision).toBeNull();

    const { snapshot, revision } = await addMarketSnapshot(repos, forecast.id, {
      at: "2099-01-02T15:00:00.000Z",
      conditions: "Trend day developing",
      conditionTags: ["Trending"],
      bias: "BULLISH",
      notes: "",
      updateForecast: true,
    });
    expect(revision).toMatchObject({ number: 1, snapshotId: snapshot.id });
    expect(revision!.content).toMatchObject({ marketConditions: "Trend day developing", bias: "BULLISH", conditionTags: ["Trending"] });
    expect(revision!.reason).toContain("Trend day developing");
    expect((await repos.forecasts.listSnapshots(forecast.id)).map((s) => s.conditions)).toEqual(["Still quiet", "Trend day developing"]);
  });

  it("updates the draft instead of revising before finalization", async () => {
    const forecast = await createForecast(repos, FUTURE);
    const { revision } = await addMarketSnapshot(repos, forecast.id, {
      at: "2099-01-02T14:00:00.000Z",
      conditions: "Range",
      conditionTags: [],
      bias: null,
      notes: "",
      updateForecast: true,
    });
    expect(revision).toBeNull();
    expect((await repos.forecasts.listRevisions(forecast.id))[0]!.content.marketConditions).toBe("Range");
  });
});

describe("trade links", () => {
  async function trade(openedAt: string) {
    return createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: openedAt });
  }

  it("links to one scenario, requires reasons for deviations, and evaluates the revision active at entry", async () => {
    const s = scenario("Breakout");
    const forecast = await finalForecast(FUTURE, { bias: "BEARISH", scenarios: [s] }, "2099-01-02T13:00:00.000Z");
    await createRevision(repos, forecast.id, { ...emptyForecastContent(), bias: "BULLISH", scenarios: [s] }, "Reclaimed VWAP", {
      now: "2099-01-02T16:00:00.000Z",
    });
    const t = await trade("2099-01-02T14:30:00.000Z");

    await expect(
      setForecastLink(repos, t.id, { planned: true, forecastId: forecast.id, scenarioId: newId(), adherence: "YES", reason: "" }),
    ).rejects.toThrow("Choose a scenario");
    await expect(
      setForecastLink(repos, t.id, { planned: true, forecastId: forecast.id, scenarioId: s.id, adherence: "PARTIAL", reason: "" }),
    ).rejects.toThrow("Explain");

    const link = await setForecastLink(repos, t.id, {
      planned: true,
      forecastId: forecast.id,
      scenarioId: s.id,
      adherence: "PARTIAL",
      reason: "Entered early",
    });
    const revisions = await repos.forecasts.listRevisions(forecast.id);
    expect(link.revisionIdAtEntry).toBe(revisions[0]!.id);

    const context = await loadTradeForecastContext(repos, t);
    expect(context.dayForecast?.id).toBe(forecast.id);
    expect(context.atEntry).toMatchObject({ matchesBias: false, scenario: { title: "Breakout" } });
    expect(context.latest).toMatchObject({ matchesBias: true });
  });

  it("requires a reason for unplanned trades and can be required to close", async () => {
    const settings = await repos.settings.getApp();
    await repos.settings.saveApp({ ...settings, requiredFields: ["forecast"] });
    const t = await trade("2099-01-02T14:30:00.000Z");
    await addFill(repos, t.id, { type: "EXIT", price: 5001, quantity: 1, timestamp: "2099-01-02T14:40:00.000Z", reason: "", notes: "" });

    expect((await loadTradeWorkspace(repos, t.id)).readiness.missing).toEqual(["forecast"]);
    await expect(setForecastLink(repos, t.id, { planned: false, reason: "" })).rejects.toThrow("Explain");
    await setForecastLink(repos, t.id, { planned: false, reason: "Saw a clean break, no plan for it" });
    await closeTrade(repos, t.id);

    await expect(clearForecastLink(repos, t.id)).rejects.toThrow("complete");
    expect(await repos.forecasts.getLinkForTrade(t.id)).toBeDefined();

    await moveToTrash(repos, t.id);
    await permanentlyDelete(repos, t.id);
    expect(await repos.forecasts.getLinkForTrade(t.id)).toBeUndefined();
  });
});

describe("forecast workspace", () => {
  it("detects level touches from fills and lists deviations", async () => {
    const hit = level(5010, { label: "PDH" });
    const zone = level(4990, { priceTo: 4995, label: "Demand" });
    const miss = level(5100);
    const nq = level(5010, { instruments: ["NQ"] });
    const s = scenario("Breakout");
    const forecast = await finalForecast(FUTURE, { scenarios: [s], keyLevels: [hit, zone, miss, nq] });

    const t = await createQuickTrade(repos, {
      symbol: "ESZ6",
      direction: "LONG",
      entryPrice: 4993,
      contracts: 1,
      timestamp: "2099-01-02T14:30:00.000Z",
    });
    await addFill(repos, t.id, { type: "EXIT", price: 5009.5, quantity: 1, timestamp: "2099-01-02T15:00:00.000Z", reason: "", notes: "" });
    await setForecastLink(repos, t.id, { planned: true, forecastId: forecast.id, scenarioId: s.id, adherence: "NO", reason: "Faded it" });

    const ws = await loadForecastWorkspace(repos, forecast.id);
    expect(ws.detectedTouches.map((d) => d.levelId).sort()).toEqual([hit.id, zone.id].sort());
    expect(ws.trades).toHaveLength(1);
    expect(ws.deviations).toHaveLength(1);
    expect(ws.locked).toBe(false);

    const overview = await loadForecastsOverview(repos);
    expect(overview.items[0]).toMatchObject({ linkedTrades: 1, deviations: 1, revisionCount: 0 });
  });
});
