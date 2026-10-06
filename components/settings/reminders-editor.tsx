"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Card } from "@/components/ui/card";
import { Button, FormStatus, Input } from "@/components/ui/form";
import type { Reminder } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { saveReminders } from "@/lib/services/settings";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";

const KIND_LABEL: Record<Reminder["kind"], string> = {
  START_OF_DAY: "Start of day",
  END_OF_DAY: "End of day",
  NEW_TRADE: "When opening a new trade",
  CUSTOM: "Custom",
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const noSubscribe = () => () => {};
const notificationPermission = (): NotificationPermission | "unsupported" =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

type Status = { kind: "saved" | "error"; message: string } | null;

/** Reminders (spec §30): shown as banners while the app is open, at their time on their days. */
export function RemindersEditor() {
  const load = useCallback(async (repos: JournalRepositories) => (await repos.settings.getApp()).reminders, []);
  const query = useJournalQuery(load);
  const [draft, setDraft] = useState<Reminder[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const initialPermission = useSyncExternalStore(noSubscribe, notificationPermission, () => "unsupported" as const);
  const [requested, setPermission] = useState<NotificationPermission | null>(null);
  const permission = requested ?? initialPermission;

  if (query.status !== "ready") {
    return (
      <Card>
        <h2 className="text-base font-semibold">Reminders</h2>
        <p className="mt-2 text-sm text-muted">{query.status === "loading" ? "Loading…" : query.error.message}</p>
      </Card>
    );
  }
  const reminders = draft ?? query.data;

  function update(index: number, patch: Partial<Reminder>) {
    setDraft(reminders.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setStatus(null);
  }

  async function onSave() {
    try {
      await saveReminders(getRepositories(), reminders);
      setDraft(null);
      setStatus({ kind: "saved", message: "Reminders saved." });
      query.reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Reminders</h2>
        <p className="mt-1 text-sm text-muted">
          Shown at the top of the app at their time (in your journal timezone) while it&apos;s open. Dismissed reminders
          come back the next day.
        </p>
      </div>

      <ul className="space-y-3">
        {reminders.map((r, index) => {
          const base = `reminder-${index}`;
          return (
            <li key={r.id || base} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => update(index, { enabled: e.target.checked })}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {KIND_LABEL[r.kind]}
                </label>
                {r.kind !== "NEW_TRADE" && (
                  <Input
                    type="time"
                    aria-label={`${KIND_LABEL[r.kind]} reminder time`}
                    value={r.time ?? ""}
                    onChange={(e) => update(index, { time: e.target.value || null })}
                    className="w-32"
                  />
                )}
                {r.kind === "CUSTOM" && (
                  <Button
                    variant="ghost"
                    aria-label={`Remove reminder: ${r.message || "new reminder"}`}
                    onClick={() => {
                      setDraft(reminders.filter((_, i) => i !== index));
                      setStatus(null);
                    }}
                    className="ml-auto"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                )}
              </div>
              <Input
                aria-label={`${KIND_LABEL[r.kind]} reminder message`}
                value={r.message}
                onChange={(e) => update(index, { message: e.target.value })}
                placeholder="Reminder text"
              />
              {r.kind !== "NEW_TRADE" && (
                <fieldset className="flex flex-wrap gap-3">
                  <legend className="sr-only">Days for {KIND_LABEL[r.kind]} reminder</legend>
                  {WEEKDAY_LABELS.map((label, day) => (
                    <label key={label} className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={r.weekdays.includes(day)}
                        onChange={(e) =>
                          update(index, {
                            weekdays: e.target.checked ? [...r.weekdays, day] : r.weekdays.filter((d) => d !== day),
                          })
                        }
                        className="size-3.5 accent-[var(--accent)]"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() =>
            setDraft([
              ...reminders,
              { id: "", kind: "CUSTOM", message: "", time: "12:00", weekdays: [0, 1, 2, 3, 4], enabled: true },
            ])
          }
        >
          <Plus aria-hidden className="size-4" /> Add reminder
        </Button>
        <Button variant="primary" onClick={() => void onSave()} disabled={draft === null}>
          Save reminders
        </Button>
        {permission === "default" && (
          <Button
            variant="ghost"
            onClick={() => void Notification.requestPermission().then(setPermission)}
          >
            Also show as system notifications
          </Button>
        )}
        <FormStatus status={status} />
      </div>
    </Card>
  );
}
