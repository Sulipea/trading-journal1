import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupError, backupChecksum, type BackupFile } from "@/lib/backup/format";
import { JournalDb } from "@/lib/db/journal-db";
import { SCHEMA_VERSION } from "@/lib/db/migrations";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import {
  backupFileName,
  commitRestore,
  createBackupFile,
  parseBackup,
  prepareRestore,
  prepareSnapshotRestore,
  pruneSnapshots,
  runAutoBackupIfDue,
  serializeBackup,
  takeSnapshot,
} from "./backup";
import { addScreenshot } from "./screenshots";
import { saveStartingBalance } from "./settings";
import { addFill, closeTrade, createQuickTrade } from "./trades";

const dbs: JournalDb[] = [];
function journal(): JournalRepositories {
  const db = new JournalDb(`backup-test-${newId()}`);
  dbs.push(db);
  return createDexieRepositories(db);
}

let source: JournalRepositories;

beforeEach(async () => {
  source = journal();
  const settings = await source.settings.getApp();
  await source.settings.saveApp({ ...settings, timezone: "UTC", requiredFields: [] });
});

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    await db.delete();
    await Dexie.delete(`${db.name}-snapshots`);
  }
});

async function seed(repos: JournalRepositories) {
  await saveStartingBalance(repos, 25_000);
  const t = await createQuickTrade(repos, { symbol: "NQZ6", direction: "SHORT", entryPrice: 18000, contracts: 2, timestamp: "2026-10-06T14:00:00.000Z" });
  await addFill(repos, t.id, { type: "EXIT", price: 17990, quantity: 2, timestamp: "2026-10-06T14:30:00.000Z", reason: "Target", notes: "" });
  await closeTrade(repos, t.id);
  await addScreenshot(repos, t.id, {
    fileName: "chart.png",
    mimeType: "image/png",
    width: 10,
    height: 10,
    blob: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: "image/png" }),
    thumbnail: new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }),
  });
  return t;
}

describe("export", () => {
  it("writes schema version, counts, assets and a checksum", async () => {
    await seed(source);
    const file = await createBackupFile(source, { includeAssets: true }, "2026-10-06T18:45:00.000Z");
    expect(file).toMatchObject({ format: "trading-journal-backup", formatVersion: 1, schemaVersion: SCHEMA_VERSION, includesAssets: true });
    expect(file.counts).toMatchObject({ trades: 1, tradeEvents: 2, screenshots: 1, assets: 2 });
    expect(file.checksum).toBe(await backupChecksum(file));
    expect(backupFileName(file)).toBe("trading-journal-2026-10-06-1845.tjbackup");

    const withoutAssets = await createBackupFile(source, { includeAssets: false });
    expect(withoutAssets.tables.assets).toBeUndefined();
    expect(withoutAssets.counts.screenshots).toBe(1);
  });
});

describe("restore", () => {
  it("round-trips the whole journal, including screenshot images", async () => {
    const trade = await seed(source);
    const text = serializeBackup(await createBackupFile(source, { includeAssets: true }));

    const target = journal();
    const prepared = await prepareRestore(target, text);
    expect(prepared.warnings).toEqual([]);
    await commitRestore(target, prepared);

    expect(await target.trades.get(trade.id)).toEqual(await source.trades.get(trade.id));
    expect(await target.tradeEvents.listForTrade(trade.id)).toEqual(await source.tradeEvents.listForTrade(trade.id));
    expect((await target.settings.getAccount()).startingBalance).toBe(25_000);
    const [shot] = await target.screenshots.listForTrade(trade.id);
    const asset = await target.assets.get(shot!.assetId);
    expect([...new Uint8Array(await asset!.blob.arrayBuffer())]).toEqual([137, 80, 78, 71, 1, 2, 3]);
  });

  it("replaces everything, after taking a safety snapshot that can undo it", async () => {
    await seed(source);
    const backup = serializeBackup(await createBackupFile(source, { includeAssets: false }));

    const target = journal();
    const keep = await createQuickTrade(target, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: "2026-10-01T14:00:00.000Z" });
    const prepared = await prepareRestore(target, backup);
    expect(prepared.warnings).toEqual(expect.arrayContaining([
      "Your current journal (1 trades) will be replaced entirely.",
      "This backup doesn't include screenshot images; screenshots will show as unavailable.",
    ]));
    const safety = await commitRestore(target, prepared);
    expect(await target.trades.get(keep.id)).toBeUndefined();
    expect(safety.kind).toBe("PRE_RESTORE");

    // Undo via the safety snapshot.
    await commitRestore(target, await prepareSnapshotRestore(target, safety.id));
    expect(await target.trades.get(keep.id)).toBeDefined();
  });

  it("rejects files that aren't backups, were altered, or come from a newer version", async () => {
    await seed(source);
    const file = await createBackupFile(source, { includeAssets: false });
    await expect(parseBackup("not json")).rejects.toThrow("isn't a trading journal backup");
    await expect(parseBackup(JSON.stringify({ hello: 1 }))).rejects.toThrow("isn't a trading journal backup");

    const tampered: BackupFile = structuredClone(file);
    (tampered.tables.trades![0] as { fees: number }).fees = 999;
    await expect(parseBackup(JSON.stringify(tampered))).rejects.toThrow("checksum mismatch");

    const future = { ...file, schemaVersion: SCHEMA_VERSION + 1 };
    future.checksum = await backupChecksum(future);
    await expect(prepareRestore(journal(), JSON.stringify(future))).rejects.toThrow("newer version");
  });

  it("refuses a backup with invalid data and leaves the journal untouched", async () => {
    await seed(source);
    const file = await createBackupFile(source, { includeAssets: false });
    (file.tables.trades![0] as { plannedContracts: number }).plannedContracts = -3;
    file.checksum = await backupChecksum(file);

    const target = journal();
    const existing = await createQuickTrade(target, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: "2026-10-01T14:00:00.000Z" });
    const error = await prepareRestore(target, JSON.stringify(file)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupError);
    expect((error as BackupError).problems[0]).toMatch(/^trades .*plannedContracts/);
    expect(await target.trades.get(existing.id)).toBeDefined();
  });

  it("upgrades a backup made with schema version 1 through the migrations", async () => {
    const id = newId();
    const t = "2026-01-05T14:00:00.000Z";
    const tables = {
      trades: [
        {
          id, createdAt: t, updatedAt: t, status: "OPEN", symbol: "ESH6", root: "ES", direction: "LONG",
          plannedEntry: 5000, plannedStop: 4990, plannedTarget: null, plannedContracts: 1, finalStop: null,
          finalTarget: null, fees: 0, notes: "from v1", openedAt: t, closedAt: null, deletedAt: null,
        },
      ],
      tradeEvents: [],
      changeHistory: [],
      trashItems: [],
      accountSettings: [],
      appSettings: [],
    };
    const v1 = { format: "trading-journal-backup", formatVersion: 1, schemaVersion: 1, createdAt: t, includesAssets: false, counts: { trades: 1 }, tables, checksum: "" };
    v1.checksum = await backupChecksum(v1 as unknown as BackupFile);

    const target = journal();
    const prepared = await prepareRestore(target, JSON.stringify(v1));
    expect(prepared.warnings.some((w) => w.includes("older version"))).toBe(true);
    await commitRestore(target, prepared);
    expect(await target.trades.get(id)).toMatchObject({ notes: "from v1", session: null, setupId: null, unlocked: false });
  });
});

describe("automatic snapshots", () => {
  it("snapshots when due, respects the interval, and prunes only automatic ones", async () => {
    await seed(source);
    const first = await runAutoBackupIfDue(source, "2026-10-06T12:00:00.000Z");
    expect(first).toMatchObject({ kind: "AUTO", tradeCount: 1, includesAssets: false });
    expect(await runAutoBackupIfDue(source, "2026-10-06T20:00:00.000Z")).toBeNull(); // within 24h
    await takeSnapshot(source, "MANUAL", { includeAssets: false }, "2026-10-06T21:00:00.000Z");
    for (const day of ["07", "08", "09"]) await runAutoBackupIfDue(source, `2026-10-${day}T13:00:00.000Z`);

    expect(await pruneSnapshots(source, 2)).toBe(2);
    const kinds = (await source.snapshots.list()).map((s) => s.kind);
    expect(kinds.filter((k) => k === "AUTO")).toHaveLength(2);
    expect(kinds).toContain("MANUAL");
  });

  it("does nothing for an empty journal or when turned off", async () => {
    expect(await runAutoBackupIfDue(source)).toBeNull();
    await seed(source);
    const settings = await source.settings.getApp();
    await source.settings.saveApp({ ...settings, backup: { ...settings.backup, autoEnabled: false } });
    expect(await runAutoBackupIfDue(source)).toBeNull();
  });
});
