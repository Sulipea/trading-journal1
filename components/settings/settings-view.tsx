"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button, Field, FormStatus, Input, Textarea } from "@/components/ui/form";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import { requirableFieldSchema } from "@/lib/domain/schemas";
import type { RequirableField, SessionOption } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { savePreferences, saveStartingBalance } from "@/lib/services/settings";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { SessionsEditor } from "./sessions-editor";

type Status = { kind: "saved" | "error"; message: string } | null;

const REQUIRABLE_FIELDS = requirableFieldSchema.options;

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "").split(/\r?\n/);
}

export function SettingsView() {
  const load = useCallback(
    async (repos: JournalRepositories) => ({
      account: await repos.settings.getAccount(),
      app: await repos.settings.getApp(),
    }),
    [],
  );
  const query = useJournalQuery(load);
  const [accountStatus, setAccountStatus] = useState<Status>(null);
  const [prefsStatus, setPrefsStatus] = useState<Status>(null);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading settings…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Settings could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  const { account, app } = query.data;

  async function onSaveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get("startingBalance"));
    try {
      await saveStartingBalance(getRepositories(), value);
      setAccountStatus({ kind: "saved", message: "Starting balance saved." });
      query.reload();
    } catch (error) {
      setAccountStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function onSavePrefs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await savePreferences(getRepositories(), {
        timezone: String(form.get("timezone") ?? "").trim(),
        requiredFields: form.getAll("requiredFields").map(String) as RequirableField[],
        psychologyEmotions: lines(form.get("emotions")),
        psychologyRatings: lines(form.get("ratings")),
        sessions: JSON.parse(String(form.get("sessions") ?? "[]")) as SessionOption[],
      });
      setPrefsStatus({ kind: "saved", message: "Preferences saved." });
      query.reload();
    } catch (error) {
      setPrefsStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <div className="animate-in space-y-6">
      <Card>
        <h2 className="text-base font-semibold">Account</h2>
        <form key={account.updatedAt} onSubmit={onSaveAccount} className="mt-4 flex flex-wrap items-end gap-4">
          <Field
            label="Starting balance (USD)"
            htmlFor="startingBalance"
            hint="Equity = starting balance + net P&L of closed trades."
            className="w-64"
          >
            <Input
              id="startingBalance"
              name="startingBalance"
              type="number"
              step="0.01"
              required
              defaultValue={account.startingBalance}
            />
          </Field>
          <Button type="submit" variant="primary">
            Save balance
          </Button>
        </form>
        <div className="mt-3">
          <FormStatus status={accountStatus} />
        </div>
      </Card>

      <form key={app.updatedAt} onSubmit={onSavePrefs} className="space-y-6">
        <Card>
          <h2 className="text-base font-semibold">Date &amp; time</h2>
          <Field
            label="Timezone"
            htmlFor="timezone"
            hint="Used to decide which day a trade belongs to."
            className="mt-4 max-w-sm"
          >
            <Input id="timezone" name="timezone" list="timezones" required defaultValue={app.timezone} />
          </Field>
          <datalist id="timezones">
            {timezoneOptions().map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Trading sessions</h2>
          <p className="mt-1 text-sm text-muted">
            Offered in each trade&apos;s Market data section. Hiding a session keeps it on trades that already use it.
          </p>
          <div className="mt-4">
            <SessionsEditor initial={app.sessions} />
          </div>
        </Card>

        <Card>
          <fieldset>
            <legend className="text-base font-semibold">Required before closing a trade</legend>
            <p className="mt-1 text-sm text-muted">
              Symbol, direction, entry, contracts and a fully exited position are always required.
              Setups can add their own requirements.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {REQUIRABLE_FIELDS.map((field) => (
                <label key={field} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="requiredFields"
                    value={field}
                    defaultChecked={app.requiredFields.includes(field)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {REQUIRABLE_FIELD_LABELS[field]}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Psychology</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Emotions" htmlFor="emotions" hint="One per line.">
              <Textarea
                id="emotions"
                name="emotions"
                rows={10}
                defaultValue={app.psychologyEmotions.join("\n")}
              />
            </Field>
            <Field label="Rating scales (1–5)" htmlFor="ratings" hint="One per line.">
              <Textarea id="ratings" name="ratings" rows={10} defaultValue={app.psychologyRatings.join("\n")} />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-4">
          <Button type="submit" variant="primary">
            Save preferences
          </Button>
          <FormStatus status={prefsStatus} />
        </div>
      </form>

      <Card>
        <h2 className="text-base font-semibold">Setups &amp; rules</h2>
        <p className="mt-1 text-sm text-muted">
          Manage setups (with their own required fields and checklists) on the{" "}
          <Link href="/setups" className="text-accent hover:underline">Setups</Link> page, and rules, groups and
          severities on the <Link href="/rules" className="text-accent hover:underline">Rules</Link> page.
        </p>
      </Card>

      <p className="text-sm text-muted">
        Forecast defaults, reminders, AI controls and backups will appear here as those features are built.
      </p>
    </div>
  );
}
