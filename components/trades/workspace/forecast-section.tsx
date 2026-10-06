"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { BIAS_LABELS, formatTradingDate } from "@/components/forecasts/labels";
import { Button, Field, FormStatus, Select, Textarea } from "@/components/ui/form";
import type { ForecastAdherence } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import {
  clearForecastLink,
  loadTradeForecastContext,
  setForecastLink,
  type RevisionView,
  type TradeForecastContext,
} from "@/lib/services/forecast-links";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";
import { Section } from "./section";

const ADHERENCE: { value: ForecastAdherence; label: string }[] = [
  { value: "YES", label: "Yes" },
  { value: "PARTIAL", label: "Partially" },
  { value: "NO", label: "No" },
];

export function ForecastSection({ number }: { number: number }) {
  const { ws, required } = useWorkspace();
  const missing = ws.trade.status !== "CLOSED" && ws.readiness.missing.includes("forecast");
  return (
    <Section number={number} title="Forecast / context" incomplete={missing}>
      {required.has("forecast") && (
        <p className={cn("mb-3 text-xs", missing ? "text-negative" : "text-muted")}>
          Linking to a forecast (or marking the trade unplanned) is required to close.
        </p>
      )}
      {/* Remount when the trade changes so the form reflects the saved link. */}
      <ForecastLinker key={ws.trade.updatedAt} />
    </Section>
  );
}

function ForecastLinker() {
  const { ws, readOnly, reload } = useWorkspace();
  const [forecastId, setForecastId] = useState<string | null>(null);
  const load = useCallback(
    (repos: JournalRepositories) => loadTradeForecastContext(repos, ws.trade, forecastId),
    [ws.trade, forecastId],
  );
  const query = useJournalQuery(load);
  if (query.status === "loading") return <p className="text-sm text-muted">Loading forecasts…</p>;
  if (query.status === "error") return <p className="text-sm text-negative">{query.error.message}</p>;
  return (
    <LinkForm
      ctx={query.data}
      readOnly={readOnly}
      onForecastChange={setForecastId}
      onSaved={reload}
    />
  );
}

function LinkForm({
  ctx,
  readOnly,
  onForecastChange,
  onSaved,
}: {
  ctx: TradeForecastContext;
  readOnly: boolean;
  onForecastChange: (id: string | null) => void;
  onSaved: () => void;
}) {
  const { ws } = useWorkspace();
  const link = ctx.link;
  const [planned, setPlanned] = useState(link ? link.planned : true);
  const [scenarioId, setScenarioId] = useState(
    link?.planned && link.forecastId === ctx.forecast?.id ? (link.scenarioId ?? "") : "",
  );
  const [adherence, setAdherence] = useState<ForecastAdherence>(link?.adherence ?? "YES");
  const [reason, setReason] = useState(link?.reason ?? "");
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const needsReason = !planned || adherence !== "YES";

  async function save() {
    setStatus(null);
    try {
      if (planned) {
        if (!ctx.forecast) throw new Error("Choose a forecast.");
        if (!scenarioId) throw new Error("Choose the scenario this trade belongs to.");
        await setForecastLink(getRepositories(), ws.trade.id, {
          planned: true,
          forecastId: ctx.forecast.id,
          scenarioId,
          adherence,
          reason,
        });
      } else {
        await setForecastLink(getRepositories(), ws.trade.id, { planned: false, reason });
      }
      onSaved();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <div className="space-y-4">
      {link && <CurrentLink ctx={ctx} />}

      <fieldset disabled={readOnly} className="space-y-4">
        <div role="radiogroup" aria-label="Was this trade in your forecast?" className="grid grid-cols-2 gap-2 sm:max-w-md">
          {[
            { value: true, label: "From my forecast" },
            { value: false, label: "Unplanned" },
          ].map((o) => (
            <label
              key={String(o.value)}
              className="flex cursor-pointer items-center justify-center rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input type="radio" className="sr-only" checked={planned === o.value} onChange={() => setPlanned(o.value)} />
              {o.label}
            </label>
          ))}
        </div>

        {planned && (
          <>
            {ctx.forecasts.length === 0 ? (
              <p className="text-sm text-muted">
                No forecasts yet.{" "}
                <Link href="/forecasts" className="text-accent hover:underline">
                  Create one
                </Link>{" "}
                or mark this trade unplanned.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Forecast"
                  htmlFor="link-forecast"
                  hint={ctx.dayForecast ? undefined : "There's no forecast for this trade's day."}
                >
                  <Select
                    id="link-forecast"
                    value={ctx.forecast?.id ?? ""}
                    onChange={(e) => {
                      setScenarioId("");
                      onForecastChange(e.target.value || null);
                    }}
                  >
                    {!ctx.forecast && <option value="">Choose a forecast</option>}
                    {ctx.forecasts.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatTradingDate(f.date)}
                        {f.id === ctx.dayForecast?.id ? " (trade day)" : ""}
                        {f.status === "DRAFT" ? " — draft" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Scenario" htmlFor="link-scenario">
                  <Select id="link-scenario" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                    <option value="">{ctx.scenarios.length ? "Choose a scenario" : "This forecast has no scenarios"}</option>
                    {ctx.scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Did this trade follow your forecast?</legend>
              <div className="flex gap-2">
                {ADHERENCE.map((a) => (
                  <label
                    key={a.value}
                    className="flex cursor-pointer items-center justify-center rounded-md border border-border px-4 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                  >
                    <input
                      type="radio"
                      name="adherence"
                      className="sr-only"
                      checked={adherence === a.value}
                      onChange={() => setAdherence(a.value)}
                    />
                    {a.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <Field
          label={planned ? "How did it differ?" : "Why did you take a trade that wasn't in your forecast?"}
          htmlFor="link-reason"
          hint={needsReason ? "Required — recorded as a deviation." : "Optional."}
        >
          <Textarea id="link-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save}>
            Save
          </Button>
          {link && (
            <Button
              onClick={async () => {
                try {
                  await clearForecastLink(getRepositories(), ws.trade.id);
                  onSaved();
                } catch (error) {
                  setStatus({ kind: "error", message: errorMessage(error) });
                }
              }}
            >
              Remove link
            </Button>
          )}
          <FormStatus status={status} />
        </div>
      )}
    </div>
  );
}

function biasNote(view: RevisionView, direction: string): string {
  const bias = BIAS_LABELS[view.revision.content.bias];
  if (view.matchesBias === null) return `${bias} — neutral, so neither with nor against your ${direction.toLowerCase()}`;
  return `${bias} — your ${direction.toLowerCase()} was ${view.matchesBias ? "with" : "against"} it`;
}

function CurrentLink({ ctx }: { ctx: TradeForecastContext }) {
  const { ws } = useWorkspace();
  const link = ctx.link!;
  const direction = ws.trade.direction === "LONG" ? "Long" : "Short";
  if (!link.planned) {
    return (
      <div className="rounded-lg border border-negative/40 bg-negative/5 p-3 text-sm">
        <p className="font-medium text-negative">Unplanned trade · deviation</p>
        <p className="mt-0.5">{link.reason}</p>
      </div>
    );
  }
  const deviation = link.adherence !== "YES";
  return (
    <div className={cn("space-y-1.5 rounded-lg border p-3 text-sm", deviation ? "border-negative/40 bg-negative/5" : "border-border")}>
      <p className="font-medium">
        {ctx.atEntry?.scenario?.title ?? ctx.latest?.scenario?.title ?? "Scenario"}
        <span className={cn("ml-2 text-xs", deviation ? "text-negative" : "text-muted")}>
          {link.adherence === "YES" ? "Followed the forecast" : link.adherence === "PARTIAL" ? "Partially followed · deviation" : "Didn't follow · deviation"}
        </span>
      </p>
      {link.reason && <p>{link.reason}</p>}
      <dl className="space-y-0.5 text-xs text-muted">
        <div>
          <dt className="inline">Active at entry: </dt>
          <dd className="inline">
            {ctx.atEntry
              ? `${ctx.atEntry.revision.number === 0 ? "original" : `revision ${ctx.atEntry.revision.number}`} · ${biasNote(ctx.atEntry, direction)}`
              : "no finalized forecast yet when this trade was opened"}
          </dd>
        </div>
        {ctx.latest && ctx.latest.revision.id !== ctx.atEntry?.revision.id && (
          <div>
            <dt className="inline">Latest forecast: </dt>
            <dd className="inline">
              revision {ctx.latest.revision.number} · {biasNote(ctx.latest, direction)}
            </dd>
          </div>
        )}
        {ctx.forecast && (
          <div>
            <Link href={`/forecasts/${ctx.forecast.id}`} className="text-accent hover:underline">
              Open forecast for {formatTradingDate(ctx.forecast.date)}
            </Link>
          </div>
        )}
      </dl>
    </div>
  );
}
