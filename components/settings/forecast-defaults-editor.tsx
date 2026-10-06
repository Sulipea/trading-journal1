"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button, Field, FormStatus, Input, Select } from "@/components/ui/form";
import type { Confidence } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { saveForecastDefaults } from "@/lib/services/settings";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";

/** Forecast defaults (spec §36): what a new day's forecast starts with. */
export function ForecastDefaultsEditor() {
  const load = useCallback(async (repos: JournalRepositories) => (await repos.settings.getApp()).forecastDefaults, []);
  const query = useJournalQuery(load);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  if (query.status !== "ready") {
    return (
      <Card>
        <h2 className="text-base font-semibold">Forecast defaults</h2>
        <p className="mt-2 text-sm text-muted">{query.status === "loading" ? "Loading…" : query.error.message}</p>
      </Card>
    );
  }
  const defaults = query.data;

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await saveForecastDefaults(getRepositories(), {
        confidence: String(form.get("confidence")) as Confidence,
        conditionTags: String(form.get("conditionTags") ?? "").split(","),
        copyPreviousKeyLevels: form.get("copyPreviousKeyLevels") === "on",
      });
      setStatus({ kind: "saved", message: "Forecast defaults saved." });
      query.reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold">Forecast defaults</h2>
      <p className="mt-1 text-sm text-muted">What each new day&apos;s forecast starts with. You can change anything before finalizing.</p>
      <form key={JSON.stringify(defaults)} onSubmit={onSave} className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Confidence" htmlFor="defaultConfidence" className="w-40">
            <Select id="defaultConfidence" name="confidence" defaultValue={defaults.confidence}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </Field>
          <Field label="Condition tags" htmlFor="defaultConditionTags" hint="Comma-separated." className="min-w-64 flex-1">
            <Input id="defaultConditionTags" name="conditionTags" defaultValue={defaults.conditionTags.join(", ")} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="copyPreviousKeyLevels"
            defaultChecked={defaults.copyPreviousKeyLevels}
            className="size-4 accent-[var(--accent)]"
          />
          Copy key levels from the previous forecast
        </label>
        <div className="flex items-center gap-4">
          <Button type="submit">Save forecast defaults</Button>
          <FormStatus status={status} />
        </div>
      </form>
    </Card>
  );
}
