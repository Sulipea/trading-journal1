import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_REQUIRED_FIELDS } from "@/lib/domain/defaults";
import { newId } from "@/lib/domain/ids";
import { APP_SETTINGS_ID, appSettingsSchema, tradeSchema } from "@/lib/domain/schemas";
import { JournalDb } from "./journal-db";
import { SCHEMA_VERSION, applyMigrations } from "./migrations";

const name = `migration-test-${newId()}`;

afterEach(async () => {
  await Dexie.delete(name);
});

describe("schema migrations", () => {
  it("upgrades version 1 data to the current schema without losing it", async () => {
    // Write data the way a version-1 install stored it.
    const v1 = new Dexie(name);
    applyMigrations(v1, 1);
    const tradeId = newId();
    const t = "2026-10-01T14:00:00.000Z";
    await v1.table("trades").add({
      id: tradeId,
      createdAt: t,
      updatedAt: t,
      status: "CLOSED",
      symbol: "NQZ6",
      root: "NQ",
      direction: "SHORT",
      plannedEntry: 18000,
      plannedStop: 18010,
      plannedTarget: 17950,
      plannedContracts: 2,
      finalStop: null,
      finalTarget: null,
      fees: 4.2,
      notes: "kept",
      openedAt: t,
      closedAt: t,
      deletedAt: null,
    });
    await v1.table("appSettings").add({
      id: APP_SETTINGS_ID,
      createdAt: t,
      updatedAt: t,
      timezone: "America/Chicago",
      aiStatus: "NOT_CONFIGURED",
    });
    v1.close();

    const db = new JournalDb(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);

    const trade = tradeSchema.parse(await db.trades.get(tradeId));
    expect(trade).toMatchObject({
      notes: "kept",
      fees: 4.2,
      plannedContracts: 2,
      session: null,
      reasoning: "",
      unlocked: false,
    });

    const settings = appSettingsSchema.parse(await db.appSettings.get(APP_SETTINGS_ID));
    expect(settings.timezone).toBe("America/Chicago");
    expect(settings.requiredFields).toEqual(DEFAULT_REQUIRED_FIELDS);
    expect(settings.psychologyEmotions.length).toBeGreaterThan(0);

    db.close();
  });
});
