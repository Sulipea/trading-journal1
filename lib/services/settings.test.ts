import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import { DEFAULT_SESSIONS } from "@/lib/domain/defaults";
import {
  cleanList,
  cleanSessions,
  isValidTimezone,
  saveBackupSettings,
  savePreferences,
  saveReminders,
  saveStartingBalance,
} from "./settings";
import { createForecast, defaultForecastContent, finalizeForecast } from "./forecasts";
import { saveForecastDefaults } from "./settings";
import { emptyForecastContent } from "@/lib/domain/forecast";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(() => {
  db = new JournalDb(`settings-test-${newId()}`);
  repos = createDexieRepositories(db);
});

afterEach(async () => {
  await db.delete();
});

describe("sessions", () => {
  it("renames, hides and adds sessions but never drops existing ones", () => {
    const result = cleanSessions(
      [
        { id: "ASIA", label: "Tokyo", active: true },
        { id: "LONDON", label: "London", active: false },
        { id: "", label: "  RTH close ", active: true },
        { id: "", label: "", active: true },
      ],
      DEFAULT_SESSIONS,
    );
    expect(result.slice(0, 3).map((s) => [s.label, s.active])).toEqual([
      ["Tokyo", true],
      ["London", false],
      ["RTH close", true],
    ]);
    expect(result[2]!.id).toMatch(/^[0-9a-f-]{36}$/);
    // Sessions left out of the edit are kept, hidden.
    expect(result.filter((s) => ["NY_AM", "NY_LUNCH", "NY_PM"].includes(s.id)).every((s) => !s.active)).toBe(true);
  });

  it("rejects blank names on existing sessions and duplicate active names", () => {
    expect(() => cleanSessions([{ id: "ASIA", label: " ", active: true }], DEFAULT_SESSIONS)).toThrow("need a name");
    expect(() =>
      cleanSessions(
        [
          { id: "ASIA", label: "Asia", active: true },
          { id: "", label: "asia", active: true },
        ],
        DEFAULT_SESSIONS,
      ),
    ).toThrow("two sessions");
  });
});

describe("settings", () => {
  it("cleans lists: trims, drops blanks and case-insensitive duplicates", () => {
    expect(cleanList([" Calm ", "", "calm", "FOMO", "  "])).toEqual(["Calm", "FOMO"]);
  });

  it("validates timezones", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });

  it("saves the starting balance", async () => {
    await saveStartingBalance(repos, 25_000);
    expect((await repos.settings.getAccount()).startingBalance).toBe(25_000);
    await expect(saveStartingBalance(repos, Number.NaN)).rejects.toThrow();
  });

  it("saves preferences and rejects unknown timezones", async () => {
    await savePreferences(repos, {
      timezone: "Europe/London",
      requiredFields: ["session", "session", "reasoning"],
      psychologyEmotions: ["Calm", ""],
      psychologyRatings: ["Focus"],
      sessions: [...DEFAULT_SESSIONS],
    });
    const app = await repos.settings.getApp();
    expect(app).toMatchObject({
      timezone: "Europe/London",
      requiredFields: ["session", "reasoning"],
      psychologyEmotions: ["Calm"],
    });
    await expect(
      savePreferences(repos, { ...app, timezone: "Nowhere/Land" }),
    ).rejects.toThrow("Unknown timezone");
  });
});

describe("reminders, forecast defaults and backup settings", () => {
  it("saves reminders, requiring a time for timed ones", async () => {
    await saveReminders(repos, [
      { id: "", kind: "CUSTOM", message: " Check the economic calendar ", time: "07:45", weekdays: [2, 0, 0], enabled: true },
      { id: "", kind: "NEW_TRADE", message: "Breathe", time: "09:00", weekdays: [0], enabled: true },
    ]);
    const [custom, newTrade] = (await repos.settings.getApp()).reminders;
    expect(custom).toMatchObject({ message: "Check the economic calendar", time: "07:45", weekdays: [0, 2] });
    expect(custom!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newTrade!.time).toBeNull();
    await expect(saveReminders(repos, [{ id: "", kind: "CUSTOM", message: "x", time: null, weekdays: [], enabled: true }])).rejects.toThrow(
      "needs a time",
    );
  });

  it("starts new forecasts from the defaults, copying the previous key levels", async () => {
    await saveForecastDefaults(repos, { confidence: "HIGH", conditionTags: ["Trending", " "], copyPreviousKeyLevels: true });
    const level = {
      id: "11111111-1111-4111-8111-111111111111",
      price: 5000,
      priceTo: null,
      instruments: [],
      label: "PDH",
      type: "PRIOR_HIGH" as const,
      priority: "HIGH" as const,
      expectedReaction: null,
      expectedNotes: "",
      scenarioId: null,
    };
    const previous = await createForecast(repos, "2099-01-05", { ...emptyForecastContent(), keyLevels: [level] });
    await finalizeForecast(repos, previous.id);

    const content = await defaultForecastContent(repos, "2099-01-06");
    expect(content).toMatchObject({ confidence: "HIGH", conditionTags: ["Trending"] });
    expect(content.keyLevels).toHaveLength(1);
    expect(content.keyLevels[0]).toMatchObject({ label: "PDH", price: 5000 });
    expect(content.keyLevels[0]!.id).not.toBe(level.id);

    await saveForecastDefaults(repos, { confidence: "LOW", conditionTags: [], copyPreviousKeyLevels: false });
    expect((await defaultForecastContent(repos, "2099-01-06")).keyLevels).toEqual([]);
  });

  it("validates backup settings", async () => {
    await saveBackupSettings(repos, { autoEnabled: false, intervalHours: 12, keep: 3, includeScreenshots: true });
    expect((await repos.settings.getApp()).backup).toEqual({ autoEnabled: false, intervalHours: 12, keep: 3, includeScreenshots: true });
    await expect(saveBackupSettings(repos, { autoEnabled: true, intervalHours: 0, keep: 3, includeScreenshots: false })).rejects.toThrow();
  });
});
