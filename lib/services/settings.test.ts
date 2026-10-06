import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import { cleanList, isValidTimezone, savePreferences, saveStartingBalance } from "./settings";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(() => {
  db = new JournalDb(`settings-test-${newId()}`);
  repos = createDexieRepositories(db);
});

afterEach(async () => {
  await db.delete();
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
