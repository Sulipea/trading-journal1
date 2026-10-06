/**
 * Backups (spec §35): manual export, automatic local snapshots and restore.
 *
 * Restore replaces the whole journal, so it is a two-step process: prepare
 * (parse, verify checksum, migrate and validate everything) and then, after
 * the user confirms, commit — which first takes a safety snapshot of the
 * current journal so the restore itself can be undone.
 */
import {
  BACKUP_EXTENSION,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupError,
  backupChecksum,
  backupFileSchema,
  type BackupFile,
} from "@/lib/backup/format";
import { newId, nowIso } from "@/lib/domain/ids";
import type { BackupMetadata } from "@/lib/domain/types";
import type { JournalRepositories, StagedRestore } from "@/lib/repositories/types";

export async function createBackupFile(
  repos: JournalRepositories,
  options: { includeAssets: boolean },
  now: string = nowIso(),
): Promise<BackupFile> {
  const tables = await repos.backup.dump(options.includeAssets);
  const schemaVersion = repos.backup.schemaVersion;
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion,
    createdAt: now,
    includesAssets: options.includeAssets,
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    tables,
    checksum: await backupChecksum({ schemaVersion, includesAssets: options.includeAssets, tables }),
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}

/** "trading-journal-2026-10-06-1430.tjbackup" */
export function backupFileName(file: Pick<BackupFile, "createdAt">): string {
  const stamp = file.createdAt.slice(0, 16).replace("T", "-").replace(":", "");
  return `trading-journal-${stamp}${BACKUP_EXTENSION}`;
}

/** Parse and verify a backup file's structure and checksum. Doesn't touch the journal. */
export async function parseBackup(text: string): Promise<BackupFile> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError("This isn't a trading journal backup file (it isn't valid JSON).");
  }
  const parsed = backupFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new BackupError(
      (json as { format?: unknown })?.format === BACKUP_FORMAT
        ? "This backup file is damaged or in an unsupported format."
        : "This isn't a trading journal backup file.",
    );
  }
  if ((await backupChecksum(parsed.data)) !== parsed.data.checksum) {
    throw new BackupError("This backup file has been changed or damaged since it was made (checksum mismatch).");
  }
  return parsed.data;
}

export interface PreparedRestore {
  file: Omit<BackupFile, "tables">;
  staged: StagedRestore;
  /** Things to tell the user before they confirm. */
  warnings: string[];
}

/** Validate a backup completely, without changing the journal. */
export async function prepareRestore(repos: JournalRepositories, text: string): Promise<PreparedRestore> {
  const file = await parseBackup(text);
  const staged = await repos.backup.stage(file.schemaVersion, file.tables);
  const warnings: string[] = [];
  const currentTrades = (await repos.trades.list({ includeDeleted: true })).length;
  if (currentTrades > 0) warnings.push(`Your current journal (${currentTrades} trades) will be replaced entirely.`);
  if (!file.includesAssets && (staged.counts.screenshots ?? 0) > 0) {
    warnings.push("This backup doesn't include screenshot images; screenshots will show as unavailable.");
  }
  if (file.schemaVersion < repos.backup.schemaVersion) {
    warnings.push(`The backup was made with an older version of the journal (schema ${file.schemaVersion}); it has been upgraded.`);
  }
  const meta = {
    format: file.format,
    formatVersion: file.formatVersion,
    schemaVersion: file.schemaVersion,
    createdAt: file.createdAt,
    includesAssets: file.includesAssets,
    counts: file.counts,
    checksum: file.checksum,
  };
  return { file: meta, staged, warnings };
}

/** Replace the journal with a prepared backup. Takes a safety snapshot first. */
export async function commitRestore(repos: JournalRepositories, prepared: PreparedRestore, now: string = nowIso()): Promise<BackupMetadata> {
  const safety = await takeSnapshot(repos, "PRE_RESTORE", { includeAssets: true }, now);
  await repos.backup.replaceAll(prepared.staged);
  return safety;
}

// ── snapshots ────────────────────────────────────────────────────────────

export async function takeSnapshot(
  repos: JournalRepositories,
  kind: BackupMetadata["kind"],
  options: { includeAssets: boolean },
  now: string = nowIso(),
): Promise<BackupMetadata> {
  const file = await createBackupFile(repos, options, now);
  const payload = serializeBackup(file);
  const meta: BackupMetadata = {
    id: newId(),
    createdAt: now,
    kind,
    schemaVersion: file.schemaVersion,
    tradeCount: file.counts.trades ?? 0,
    includesAssets: file.includesAssets,
    sizeBytes: new TextEncoder().encode(payload).length,
    checksum: file.checksum,
  };
  await repos.snapshots.save(meta, payload);
  return meta;
}

/** Remove automatic snapshots beyond the newest `keep`. Manual and pre-restore snapshots are never pruned. */
export async function pruneSnapshots(repos: JournalRepositories, keep: number): Promise<number> {
  const autos = (await repos.snapshots.list()).filter((s) => s.kind === "AUTO");
  const remove = autos.slice(keep).map((s) => s.id);
  await repos.snapshots.delete(remove);
  return remove.length;
}

/**
 * Take an automatic snapshot if they're enabled and the last one is older
 * than the interval. Returns the new snapshot, or null if none was due.
 */
export async function runAutoBackupIfDue(repos: JournalRepositories, now: string = nowIso()): Promise<BackupMetadata | null> {
  const { backup } = await repos.settings.getApp();
  if (!backup.autoEnabled) return null;
  const last = (await repos.snapshots.list()).find((s) => s.kind === "AUTO");
  if (last && Date.parse(now) - Date.parse(last.createdAt) < backup.intervalHours * 3_600_000) return null;
  if ((await repos.trades.list({ includeDeleted: true })).length === 0) return null; // nothing worth backing up yet
  const meta = await takeSnapshot(repos, "AUTO", { includeAssets: backup.includeScreenshots }, now);
  await pruneSnapshots(repos, backup.keep);
  return meta;
}

export async function prepareSnapshotRestore(repos: JournalRepositories, id: string): Promise<PreparedRestore> {
  const payload = await repos.snapshots.getPayload(id);
  if (!payload) throw new BackupError("That snapshot no longer exists.");
  return prepareRestore(repos, payload);
}
