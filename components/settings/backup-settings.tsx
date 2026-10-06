"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, Field, FormStatus, Input } from "@/components/ui/form";
import { BackupError } from "@/lib/backup/format";
import type { BackupMetadata } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import {
  backupFileName,
  commitRestore,
  createBackupFile,
  prepareRestore,
  prepareSnapshotRestore,
  serializeBackup,
  takeSnapshot,
  type PreparedRestore,
} from "@/lib/services/backup";
import { saveBackupSettings } from "@/lib/services/settings";
import {
  chooseBackupFolder,
  downloadText,
  folderPermission,
  supportsBackupFolder,
  writeToFolder,
} from "@/lib/ui/backup-folder";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";

type Status = { kind: "saved" | "error"; message: string } | null;

const KIND_LABEL: Record<BackupMetadata["kind"], string> = {
  AUTO: "Automatic",
  MANUAL: "Manual",
  PRE_RESTORE: "Before restore",
};

const noSubscribe = () => () => {};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function backupProblem(error: unknown): string {
  if (error instanceof BackupError && error.problems.length > 0) {
    return `${error.message} ${error.problems.slice(0, 3).join(" ")}`;
  }
  return errorMessage(error);
}

/**
 * Backups (spec §34–35): export/restore a portable file, local snapshots
 * kept in this browser, automatic-backup settings and an optional folder.
 */
export function BackupSettings() {
  const load = useCallback(
    async (repos: JournalRepositories) => ({
      settings: (await repos.settings.getApp()).backup,
      snapshots: await repos.snapshots.list(),
      folder: (await repos.snapshots.getFolderHandle()) ?? null,
    }),
    [],
  );
  const query = useJournalQuery(load);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ prepared: PreparedRestore; source: string } | null>(null);
  const [toDelete, setToDelete] = useState<BackupMetadata | null>(null);
  const folderSupported = useSyncExternalStore(noSubscribe, supportsBackupFolder, () => false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      setStatus({ kind: "saved", message: await action() });
      query.reload();
    } catch (error) {
      setStatus({ kind: "error", message: backupProblem(error) });
    } finally {
      setBusy(false);
    }
  }

  if (query.status !== "ready") {
    return (
      <Card>
        <h2 className="text-base font-semibold">Backups</h2>
        <p className="mt-2 text-sm text-muted">{query.status === "loading" ? "Loading…" : query.error.message}</p>
      </Card>
    );
  }
  const { settings, snapshots, folder } = query.data;

  const exportFile = (includeAssets: boolean) =>
    run(async () => {
      const file = await createBackupFile(getRepositories(), { includeAssets });
      downloadText(backupFileName(file), serializeBackup(file));
      return includeAssets ? "Backup with screenshots downloaded." : "Backup downloaded.";
    });

  async function onPickFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      setPending({ prepared: await prepareRestore(getRepositories(), await file.text()), source: file.name });
    } catch (error) {
      setStatus({ kind: "error", message: `Nothing was changed. ${backupProblem(error)}` });
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreSnapshot(meta: BackupMetadata) {
    setBusy(true);
    setStatus(null);
    try {
      setPending({
        prepared: await prepareSnapshotRestore(getRepositories(), meta.id),
        source: `${KIND_LABEL[meta.kind].toLowerCase()} snapshot from ${formatWhen(meta.createdAt)}`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: `Nothing was changed. ${backupProblem(error)}` });
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setBusy(true);
    try {
      await commitRestore(getRepositories(), pending.prepared);
      // Every view reloads from the restored data.
      window.location.reload();
    } catch (error) {
      setBusy(false);
      setPending(null);
      setStatus({ kind: "error", message: `Restore failed; your journal was not changed. ${backupProblem(error)}` });
    }
  }

  async function onSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await saveBackupSettings(getRepositories(), {
        autoEnabled: form.get("autoEnabled") === "on",
        intervalHours: Number(form.get("intervalHours")),
        keep: Number(form.get("keep")),
        includeScreenshots: form.get("includeScreenshots") === "on",
      });
      return "Backup settings saved.";
    });
  }

  const backupToFolder = () =>
    run(async () => {
      const repos = getRepositories();
      let handle = folder;
      if (!handle) {
        handle = await chooseBackupFolder();
        await repos.snapshots.setFolderHandle(handle);
      }
      if ((await folderPermission(handle, true)) !== "granted") throw new Error("Access to the backup folder wasn't granted.");
      const file = await createBackupFile(repos, { includeAssets: settings.includeScreenshots });
      await writeToFolder(handle, backupFileName(file), serializeBackup(file));
      return `Saved ${backupFileName(file)} to “${handle.name}”.`;
    });

  const counts = pending?.prepared.staged.counts ?? {};

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Backups</h2>
        <p className="mt-1 text-sm text-muted">
          Your journal lives only in this browser. Download a backup regularly and keep it somewhere safe — clearing
          site data or losing this device would otherwise lose it.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Export &amp; restore</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => exportFile(false)}>
            Export backup
          </Button>
          <Button disabled={busy} onClick={() => exportFile(true)}>
            Export with screenshots
          </Button>
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            Restore from file…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".tjbackup,application/json"
            className="sr-only"
            aria-label="Backup file to restore"
            tabIndex={-1}
            onChange={(e) => void onPickFile(e.target.files)}
          />
        </div>
        <p className="text-xs text-muted">
          Restoring checks the whole file first and replaces the journal only if everything is valid. A snapshot of
          your current journal is taken first, so a restore can be undone.
        </p>
      </div>

      <form key={JSON.stringify(settings)} onSubmit={onSaveSettings} className="space-y-3">
        <h3 className="text-sm font-semibold">Automatic snapshots</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoEnabled" defaultChecked={settings.autoEnabled} className="size-4 accent-[var(--accent)]" />
          Keep automatic snapshots in this browser while the app is open
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Every (hours)" htmlFor="intervalHours" className="w-32">
            <Input id="intervalHours" name="intervalHours" type="number" min={1} max={168} required defaultValue={settings.intervalHours} />
          </Field>
          <Field label="Keep the latest" htmlFor="keep" className="w-32">
            <Input id="keep" name="keep" type="number" min={1} max={60} required defaultValue={settings.keep} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeScreenshots"
            defaultChecked={settings.includeScreenshots}
            className="size-4 accent-[var(--accent)]"
          />
          Include screenshots in automatic and folder backups (larger)
        </label>
        <Button type="submit" disabled={busy}>
          Save backup settings
        </Button>
        <p className="text-xs text-muted">
          Snapshots protect against mistakes, not against losing this browser&apos;s data — export or use a backup folder
          for that.
        </p>
      </form>

      {folderSupported && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Backup folder</h3>
          <p className="text-sm text-muted">
            {folder
              ? `Automatic snapshots are also saved to “${folder.name}” when the browser allows it.`
              : "Choose a folder on this computer (for example one synced to the cloud) to save backups to."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={backupToFolder}>
              {folder ? "Back up to folder now" : "Choose folder & back up"}
            </Button>
            {folder && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await getRepositories().snapshots.setFolderHandle(null);
                    return "Backup folder removed.";
                  })
                }
              >
                Stop using this folder
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Snapshots in this browser</h3>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await takeSnapshot(getRepositories(), "MANUAL", { includeAssets: settings.includeScreenshots });
                return "Snapshot taken.";
              })
            }
          >
            Take snapshot now
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted">No snapshots yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border" aria-label="Snapshots">
            {snapshots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatWhen(s.createdAt)}</p>
                  <p className="text-xs text-muted">
                    {KIND_LABEL[s.kind]} · {s.tradeCount} trades · {formatSize(s.sizeBytes)}
                    {s.includesAssets ? " · with screenshots" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" disabled={busy} onClick={() => void onRestoreSnapshot(s)}>
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const payload = await getRepositories().snapshots.getPayload(s.id);
                        if (!payload) throw new Error("That snapshot no longer exists.");
                        downloadText(backupFileName(s), payload);
                        return "Snapshot downloaded.";
                      })
                    }
                  >
                    Download
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setToDelete(s)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FormStatus status={status} />

      <ConfirmDialog
        open={pending !== null}
        title="Replace your journal with this backup?"
        confirmLabel="Restore backup"
        danger
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmRestore()}
      >
        {pending && (
          <div className="space-y-2">
            <p>
              From {pending.source}, made {formatWhen(pending.prepared.file.createdAt)}: {counts.trades ?? 0} trades,{" "}
              {counts.forecasts ?? 0} forecasts, {counts.reviews ?? 0} reviews, {counts.screenshots ?? 0} screenshots.
            </p>
            {pending.prepared.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {pending.prepared.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <p>A snapshot of your current journal is saved first, so you can undo this from the snapshot list.</p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this snapshot?"
        confirmLabel="Delete snapshot"
        danger
        busy={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target) {
            void run(async () => {
              await getRepositories().snapshots.delete([target.id]);
              return "Snapshot deleted.";
            });
          }
        }}
      >
        <p>The snapshot from {toDelete ? formatWhen(toDelete.createdAt) : ""} will be removed from this browser.</p>
      </ConfirmDialog>
    </Card>
  );
}
