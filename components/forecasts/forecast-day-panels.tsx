"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Crosshair } from "lucide-react";
import { SampleSize } from "@/components/analytics/group-stats";
import { DirectionBadge, SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { Button, Field, FormStatus, Input, Select, Textarea } from "@/components/ui/form";
import { biasSchema, levelReactionSchema, scenarioOutcomeSchema } from "@/lib/domain/schemas";
import type {
  Bias,
  ForecastKeyLevel,
  ForecastScenario,
  LevelInteraction,
  LevelReaction,
  ScenarioOutcome,
} from "@/lib/domain/types";
import { formatMoney, formatPrice, formatTime, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import type { DayTrade, ForecastWorkspace } from "@/lib/services/forecast-views";
import { addMarketSnapshot, saveForecastReview, saveLevelInteraction } from "@/lib/services/forecasts";
import { cn } from "@/lib/ui/cn";
import { errorMessage } from "@/lib/ui/use-journal";
import {
  ADHERENCE_LABELS,
  BIAS_LABELS as BIAS,
  LEVEL_TYPE_LABELS,
  OUTCOME_LABELS,
  REACTION_LABELS,
  biasCorrectText,
  biasTone,
} from "./labels";

type Status = { kind: "saved" | "error"; message: string } | null;

function useRunner(reload: () => void) {
  const [status, setStatus] = useState<Status>(null);
  async function run(action: () => Promise<unknown>, message: string) {
    setStatus(null);
    try {
      await action();
      setStatus({ kind: "saved", message });
      reload();
      return true;
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
      return false;
    }
  }
  return { status, run };
}

/** Every scenario that has appeared in any revision, by id (titles for links and reviews). */
function allScenarios(ws: ForecastWorkspace): Map<string, ForecastScenario> {
  const map = new Map<string, ForecastScenario>();
  for (const r of ws.revisions) for (const s of r.content.scenarios) map.set(s.id, s);
  return map;
}

// ── snapshots ────────────────────────────────────────────────────────────

export function SnapshotsPanel({ ws, reload }: { ws: ForecastWorkspace; reload: () => void }) {
  const { status, run } = useRunner(reload);
  const [formKey, setFormKey] = useState(0);
  const revisionBySnapshot = new Map(ws.revisions.filter((r) => r.snapshotId).map((r) => [r.snapshotId!, r]));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const at = fromDateTimeLocal(String(form.get("at")));
    if (!at) return;
    const ok = await run(
      () =>
        addMarketSnapshot(getRepositories(), ws.forecast.id, {
          at,
          conditions: String(form.get("conditions") ?? ""),
          conditionTags: String(form.get("tags") ?? "").split(","),
          bias: (String(form.get("bias") ?? "") || null) as Bias | null,
          notes: String(form.get("notes") ?? ""),
          updateForecast: form.get("update") === "on",
        }),
      "Snapshot saved.",
    );
    if (ok) setFormKey((k) => k + 1);
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Market-condition snapshots</h2>
        <p className="text-xs text-muted">A timeline of how conditions changed during the day.</p>
      </div>
      {ws.snapshots.length === 0 ? (
        <p className="text-sm text-muted">No snapshots yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-border pl-4">
          {ws.snapshots.map((s) => {
            const revision = revisionBySnapshot.get(s.id);
            return (
              <li key={s.id} className="text-sm">
                <p className="text-xs text-muted">
                  <time dateTime={s.at}>{formatTime(s.at, ws.timezone)}</time>
                  {s.bias && (
                    <span className={cn("ml-2 rounded-full px-1.5 py-0.5 font-medium", biasTone(s.bias))}>{BIAS[s.bias]}</span>
                  )}
                  {revision && <span className="ml-2">→ created revision {revision.number}</span>}
                </p>
                <p>{s.conditions}</p>
                {s.conditionTags.length > 0 && <p className="text-xs text-muted">{s.conditionTags.join(", ")}</p>}
                {s.notes && <p className="text-xs text-muted">{s.notes}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {!ws.locked && (
        <form key={formKey} onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Time" htmlFor="snap-at">
              <Input id="snap-at" name="at" type="datetime-local" step={1} required defaultValue={toDateTimeLocal(new Date().toISOString())} />
            </Field>
            <Field label="Bias now" htmlFor="snap-bias">
              <Select id="snap-bias" name="bias" defaultValue="">
                <option value="">Unchanged</option>
                {biasSchema.options.map((b) => (
                  <option key={b} value={b}>
                    {BIAS[b]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Conditions" htmlFor="snap-conditions">
            <Textarea id="snap-conditions" name="conditions" rows={2} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Condition tags" htmlFor="snap-tags" hint="Comma-separated.">
              <Input id="snap-tags" name="tags" />
            </Field>
            <Field label="Notes" htmlFor="snap-notes">
              <Input id="snap-notes" name="notes" />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="update" className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              Update the forecast with these conditions
              <span className="block text-xs text-muted">
                {ws.forecast.status === "DRAFT"
                  ? "Edits the draft."
                  : "Creates a new revision; the current one is kept."}
              </span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary">
              Add snapshot
            </Button>
            <FormStatus status={status} />
          </div>
        </form>
      )}
    </Card>
  );
}

// ── trades ───────────────────────────────────────────────────────────────

function linkText(t: DayTrade, scenarios: Map<string, ForecastScenario>): string {
  if (!t.link) return "Not linked";
  if (!t.link.planned) return ADHERENCE_LABELS.UNPLANNED;
  const scenario = t.link.scenarioId ? scenarios.get(t.link.scenarioId)?.title : null;
  return `${scenario ?? "Scenario"} · ${t.link.adherence ? ADHERENCE_LABELS[t.link.adherence] : ""}`;
}

export function DayTradesPanel({ ws }: { ws: ForecastWorkspace }) {
  const scenarios = allScenarios(ws);
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Trades</h2>
        <p className="text-xs text-muted">Trades opened on this day, and any linked to this forecast.</p>
      </div>
      {ws.trades.length === 0 ? (
        <p className="text-sm text-muted">No trades for this day.</p>
      ) : (
        <ul className="divide-y divide-border">
          {ws.trades.map((t) => {
            const net = t.metrics.fills?.netPnl ?? null;
            const deviation = t.link && (!t.link.planned || t.link.adherence !== "YES");
            return (
              <li key={t.trade.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link href={`/trades/${t.trade.id}`} className="font-mono font-medium hover:underline">
                  {t.trade.symbol}
                </Link>
                <DirectionBadge direction={t.trade.direction} />
                <span className="text-xs text-muted">{formatTime(t.trade.openedAt, ws.timezone)}</span>
                <span className={cn("text-xs", !t.link ? "text-negative" : deviation ? "text-negative" : "text-muted")}>
                  {linkText(t, scenarios)}
                </span>
                <span className="ml-auto">
                  <SignedValue value={net}>{net === null ? "—" : formatMoney(net, { signed: true })}</SignedValue>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">Link trades from each trade&apos;s Forecast / context section.</p>
    </Card>
  );
}

// ── key levels ───────────────────────────────────────────────────────────

export function LevelsPanel({ ws, reload }: { ws: ForecastWorkspace; reload: () => void }) {
  const levels = [...ws.active.content.keyLevels].sort((a, b) => b.price - a.price);
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Key levels — what happened</h2>
        <p className="text-xs text-muted">
          Recording outcomes never changes the forecast. Touches are detected from your own fills (within two ticks).
        </p>
      </div>
      {levels.length === 0 ? (
        <p className="text-sm text-muted">This forecast has no key levels.</p>
      ) : (
        <ul className="space-y-3">
          {levels.map((level) => (
            <LevelRow
              key={level.id}
              level={level}
              ws={ws}
              interaction={ws.interactions.find((i) => i.levelId === level.id) ?? null}
              reload={reload}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LevelRow({
  level,
  ws,
  interaction,
  reload,
}: {
  level: ForecastKeyLevel;
  ws: ForecastWorkspace;
  interaction: LevelInteraction | null;
  reload: () => void;
}) {
  const { status, run } = useRunner(reload);
  const detected = ws.detectedTouches.find((d) => d.levelId === level.id);
  const [touched, setTouched] = useState(interaction?.touched ?? false);
  const [outcome, setOutcome] = useState<LevelReaction | null>(interaction?.outcome ?? null);
  const [notes, setNotes] = useState(interaction?.notes ?? "");
  const [tradeIds, setTradeIds] = useState<string[]>(interaction?.tradeIds ?? []);
  const id = (name: string) => `lvl-${level.id}-${name}`;

  const save = (source: LevelInteraction["source"], extra: Partial<{ touched: boolean; tradeIds: string[] }> = {}) =>
    run(
      () =>
        saveLevelInteraction(getRepositories(), ws.forecast.id, level.id, {
          touched: extra.touched ?? touched,
          outcome,
          source,
          notes,
          tradeIds: extra.tradeIds ?? tradeIds,
        }),
      "Saved.",
    );

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-mono font-semibold tabular-nums">
          {formatPrice(level.price)}
          {level.priceTo !== null && `–${formatPrice(level.priceTo)}`}
        </span>
        <span>{level.label || "—"}</span>
        <span className="text-xs text-muted">
          {LEVEL_TYPE_LABELS[level.type]} · {level.instruments.length ? level.instruments.join(", ") : "all instruments"}
          {level.expectedReaction && ` · expected ${REACTION_LABELS[level.expectedReaction].toLowerCase()}`}
        </span>
      </div>

      {detected && !interaction?.touched && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-accent/8 px-2.5 py-1.5 text-xs">
          <Crosshair aria-hidden className="size-3.5 text-accent" />
          Detected a touch from {detected.tradeIds.length} trade fill{detected.tradeIds.length === 1 ? "" : "s"}.
          <Button
            className="ml-auto px-2 py-0.5 text-xs"
            onClick={() => {
              setTouched(true);
              const ids = [...new Set([...tradeIds, ...detected.tradeIds])];
              setTradeIds(ids);
              void save("AUTO", { touched: true, tradeIds: ids });
            }}
          >
            Confirm touch
          </Button>
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={touched} onChange={(e) => setTouched(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Touched
        </label>
        <Field label="Outcome" htmlFor={id("outcome")}>
          <Select id={id("outcome")} value={outcome ?? ""} onChange={(e) => setOutcome((e.target.value || null) as LevelReaction | null)}>
            <option value="">—</option>
            {levelReactionSchema.options.map((r) => (
              <option key={r} value={r}>
                {REACTION_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor={id("notes")} className="md:col-span-2">
          <Input id={id("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {ws.trades.length > 0 && (
        <fieldset className="mt-2">
          <legend className="mb-1 text-xs text-muted">Trades at this level</legend>
          <div className="flex flex-wrap gap-1.5">
            {ws.trades.map((t) => (
              <label
                key={t.trade.id}
                className="cursor-pointer rounded-full border border-border px-2 py-0.5 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={tradeIds.includes(t.trade.id)}
                  onChange={() =>
                    setTradeIds((ids) => (ids.includes(t.trade.id) ? ids.filter((x) => x !== t.trade.id) : [...ids, t.trade.id]))
                  }
                />
                {t.trade.symbol} {formatTime(t.trade.openedAt, ws.timezone)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button className="py-1 text-xs" onClick={() => save(interaction?.source ?? "MANUAL")}>
          Save outcome
        </Button>
        <FormStatus status={status} />
      </div>
    </li>
  );
}

// ── end-of-day review ────────────────────────────────────────────────────

export function ReviewPanel({ ws, reload }: { ws: ForecastWorkspace; reload: () => void }) {
  const { status, run } = useRunner(reload);
  const review = ws.forecast.review;
  const scenarios = ws.active.content.scenarios;
  const [outcomes, setOutcomes] = useState<Record<string, ScenarioOutcome>>(review?.scenarioOutcomes ?? {});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        saveForecastReview(getRepositories(), ws.forecast.id, {
          actualBias: (String(form.get("actualBias") ?? "") || null) as Bias | null,
          actualOutcome: String(form.get("actualOutcome") ?? ""),
          scenarioOutcomes: outcomes,
          notes: String(form.get("reviewNotes") ?? ""),
        }),
      "Review saved.",
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold">End-of-day review</h2>
        <p className="text-xs text-muted">What actually happened. Judged against the final revision.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Actual market direction" htmlFor="actualBias">
              <Select id="actualBias" name="actualBias" defaultValue={review?.actualBias ?? ""}>
                <option value="">—</option>
                {biasSchema.options.map((b) => (
                  <option key={b} value={b}>
                    {BIAS[b]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Actual market outcome" htmlFor="actualOutcome" className="md:col-span-2">
              <Textarea id="actualOutcome" name="actualOutcome" rows={2} defaultValue={review?.actualOutcome ?? ""} />
            </Field>
          </div>
          {scenarios.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium">Scenario outcomes</legend>
              <ul className="mt-2 space-y-2">
                {scenarios.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <label htmlFor={`outcome-${s.id}`} className="min-w-48 flex-1">
                      {s.title}
                    </label>
                    <Select
                      id={`outcome-${s.id}`}
                      value={outcomes[s.id] ?? ""}
                      onChange={(e) =>
                        setOutcomes((o) => {
                          const next = { ...o };
                          if (e.target.value) next[s.id] = e.target.value as ScenarioOutcome;
                          else delete next[s.id];
                          return next;
                        })
                      }
                      className="w-48"
                    >
                      <option value="">—</option>
                      {scenarioOutcomeSchema.options.map((o) => (
                        <option key={o} value={o}>
                          {OUTCOME_LABELS[o]}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <Field label="Review notes" htmlFor="reviewNotes">
            <Textarea id="reviewNotes" name="reviewNotes" rows={2} defaultValue={review?.notes ?? ""} />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary">
              Save review
            </Button>
            <FormStatus status={status} />
          </div>
        </form>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AccuracyCard ws={ws} />
        <ExecutionCard ws={ws} />
      </div>
    </div>
  );
}

function AccuracyCard({ ws }: { ws: ForecastWorkspace }) {
  const a = ws.accuracy;
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Forecast accuracy</h2>
        <p className="text-xs text-muted">Did the expected market scenario and conditions occur?</p>
      </div>
      {!a || !ws.forecast.review ? (
        <p className="text-sm text-muted">Save the end-of-day review to see accuracy.</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Original bias ({BIAS[a.originalBias]})</dt>
            <dd>{biasCorrectText(a.originalBiasCorrect)}</dd>
          </div>
          {a.revisionCount > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Final bias ({BIAS[a.finalBias]}, after {a.revisionCount} revision{a.revisionCount === 1 ? "" : "s"})</dt>
              <dd>{biasCorrectText(a.finalBiasCorrect)}</dd>
            </div>
          )}
          {a.revisionEffect && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Did revising help?</dt>
              <dd>{a.revisionEffect === "IMPROVED" ? "Yes — improved" : a.revisionEffect === "WORSENED" ? "No — worse" : "No change"}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Scenarios</dt>
            <dd className="text-right">
              {a.scenarios.playedOut} played out · {a.scenarios.partial} partial · {a.scenarios.invalidated} invalidated ·{" "}
              {a.scenarios.notTriggered} didn&apos;t trigger
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function ExecutionCard({ ws }: { ws: ForecastWorkspace }) {
  const e = ws.execution;
  const scenarios = allScenarios(ws);
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Execution against the forecast</h2>
        <p className="text-xs text-muted">Did you trade according to the forecast? Scored separately from accuracy.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {(["YES", "PARTIAL", "NO", "UNPLANNED"] as const).map((k) => (
          <div key={k}>
            <dt className="text-xs text-muted">{ADHERENCE_LABELS[k]}</dt>
            <dd className="font-mono tabular-nums">{e.byAdherence[k].count}</dd>
          </div>
        ))}
      </dl>
      {e.unlinked > 0 && <p className="text-xs text-negative">{e.unlinked} closed trade(s) not linked yet.</p>}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted">Planned trades</p>
          <SignedValue value={e.planned.netPnl}>{formatMoney(e.planned.netPnl, { signed: true })}</SignedValue>
          <SampleSize stats={e.planned} className="block" />
        </div>
        <div>
          <p className="text-xs text-muted">Unplanned trades</p>
          <SignedValue value={e.unplanned.netPnl}>{formatMoney(e.unplanned.netPnl, { signed: true })}</SignedValue>
          <SampleSize stats={e.unplanned} className="block" />
        </div>
      </div>
      {ws.deviations.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Deviations</h3>
          <ul className="mt-1 space-y-1.5 text-sm">
            {ws.deviations.map((d) => (
              <li key={d.trade.id}>
                <Link href={`/trades/${d.trade.id}`} className="font-mono hover:underline">
                  {d.trade.symbol}
                </Link>{" "}
                <span className="text-xs text-muted">{linkText(d, scenarios)}</span>
                <p className="text-xs">{d.link?.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
