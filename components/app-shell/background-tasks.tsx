"use client";

import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { dueReminders, zonedNow } from "@/lib/domain/reminders";
import type { Reminder } from "@/lib/domain/types";
import { getRepositories } from "@/lib/repositories";
import { backupFileName, runAutoBackupIfDue } from "@/lib/services/backup";
import { folderPermission, writeToFolder } from "@/lib/ui/backup-folder";

const DISMISSED_KEY = "trading-journal:dismissed-reminders";
const CHECK_EVERY_MS = 30_000;

/** Per-browser convenience: which reminders were dismissed on which day. */
function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeDismissed(value: Record<string, string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the reminder will simply show again */
  }
}

/**
 * Runs quiet background work while the app is open: an automatic backup
 * snapshot when one is due (also written to the backup folder, if access
 * is already granted), and reminders (spec §30) shown as dismissible banners.
 */
export function BackgroundTasks() {
  const [due, setDue] = useState<{ reminder: Reminder; day: string }[]>([]);
  const notified = useRef(new Set<string>());

  const checkReminders = useCallback(async () => {
    try {
      const settings = await getRepositories().settings.getApp();
      const now = zonedNow(new Date(), settings.timezone);
      const list = dueReminders(settings.reminders, now, readDismissed());
      setDue(list.map((reminder) => ({ reminder, day: now.day })));
      // Optional system notification, only if the user allowed it.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const r of list) {
          const key = `${r.id}|${now.day}`;
          if (!notified.current.has(key)) {
            notified.current.add(key);
            new Notification("Trading Journal", { body: r.message, tag: key });
          }
        }
      }
    } catch {
      /* storage unavailable — skip this check */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const first = setTimeout(() => {
      void checkReminders();
      // Back up after the page has settled, so it never competes with loading.
      void (async () => {
        try {
          const repos = getRepositories();
          const snapshot = await runAutoBackupIfDue(repos);
          if (!snapshot || cancelled) return;
          const handle = await repos.snapshots.getFolderHandle();
          if (handle && (await folderPermission(handle)) === "granted") {
            const payload = await repos.snapshots.getPayload(snapshot.id);
            if (payload) await writeToFolder(handle, backupFileName(snapshot), payload);
          }
        } catch {
          /* automatic backups are best-effort; Settings shows when the last one ran */
        }
      })();
    }, 3_000);
    const timer = setInterval(() => void checkReminders(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [checkReminders]);

  if (due.length === 0) return null;
  return (
    <div role="region" aria-label="Reminders" className="mb-6 space-y-2">
      {due.map(({ reminder, day }) => (
        <div key={reminder.id} className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/8 px-4 py-3 text-sm">
          <Bell aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="flex-1">{reminder.message}</p>
          <button
            type="button"
            aria-label={`Dismiss reminder: ${reminder.message}`}
            onClick={() => {
              writeDismissed({ ...readDismissed(), [reminder.id]: day });
              setDue((list) => list.filter((d) => d.reminder.id !== reminder.id));
            }}
            className="rounded p-0.5 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
