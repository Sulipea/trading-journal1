import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import { DEFAULT_SESSIONS } from "@/lib/domain/defaults";
import { cleanList, cleanSessions, isValidTimezone, savePreferences, saveStartingBalance } from "./settings";

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
