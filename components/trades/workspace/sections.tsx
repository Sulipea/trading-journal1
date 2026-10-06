"use client";

import { Lock } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import { PSYCHOLOGY_PHASE_LABELS } from "@/lib/domain/defaults";
import type { Direction, PsychologyPhase, RequirableField, Session } from "@/lib/domain/types";
import { formatMoney, formatPrice, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import { savePsychology, updateTrade, type TradePatch } from "@/lib/services/trades";
import { cn } from "@/lib/ui/cn";
import { formNumber, formText, useWorkspace } from "./context";
import { LaterPhase, Section, SectionForm } from "./section";
import { RulesChecklistSection } from "./rules-checklist";
import { ScreenshotsSection } from "./screenshots";
import { SetupSection } from "./setup-section";

function useFieldState() {
  const { ws, required } = useWorkspace();
  const closed = ws.trade.status === "CLOSED";
  return {
    isRequired: (f: RequirableField) => required.has(f),
    isMissing: (f: RequirableField) => !closed && ws.readiness.missing.includes(f),
    anyMissing: (...fields: RequirableField[]) => !closed && fields.some((f) => ws.readiness.missing.includes(f)),
  };
}

function save(patch: TradePatch, tradeId: string) {
  // Drop undefined (unchanged/disabled) fields.
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as TradePatch;
  return updateTrade(getRepositories(), tradeId, clean);
}

const missingText = "Required to close";

// 1 ─────────────────────────────────────────────────────────────────────

function MarketDataSection() {
  const { ws, readOnly } = useWorkspace();
  const f = useFieldState();
  const { trade } = ws;
  return (
    <Section number={1} title="Market data" incomplete={f.anyMissing("session", "marketConditions")}>
      <SectionForm
        resetKey={trade.updatedAt}
        onSave={(form) =>
          save(
            {
              session: (String(form.get("session")) || null) as Session | null,
              marketConditions: formText(form, "marketConditions"),
            },
            trade.id,
          )
        }
      >
        <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-3">
          <Field
            label="Session"
            htmlFor="session"
            required={f.isRequired("session")}
            error={f.isMissing("session") ? missingText : null}
          >
            <Select id="session" name="session" defaultValue={trade.session ?? ""}>
              <option value="">—</option>
              {ws.settings.sessions
                .filter((s) => s.active || s.id === trade.session)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {!s.active ? " (hidden)" : ""}
                  </option>
                ))}
              {trade.session && !ws.settings.sessions.some((s) => s.id === trade.session) && (
                <option value={trade.session}>{trade.session}</option>
              )}
            </Select>
          </Field>
          <Field
            label="Market conditions"
            htmlFor="marketConditions"
            className="md:col-span-2"
            required={f.isRequired("marketConditions")}
            error={f.isMissing("marketConditions") ? missingText : null}
            hint="Trend, range, volatility, news… Forecast snapshots link here in Phase 4."
          >
            <Textarea id="marketConditions" name="marketConditions" rows={3} defaultValue={trade.marketConditions} />
          </Field>
        </fieldset>
      </SectionForm>
    </Section>
  );
}

// 2 ─────────────────────────────────────────────────────────────────────

function TextSection({
  number,
  title,
  field,
  label,
  hint,
}: {
  number: number;
  title: string;
  field: "reasoning" | "notes";
  label: string;
  hint?: string;
}) {
  const { ws, readOnly } = useWorkspace();
  const f = useFieldState();
  const { trade } = ws;
  return (
    <Section number={number} title={title} incomplete={f.anyMissing(field)}>
      <SectionForm resetKey={trade.updatedAt} onSave={(form) => save({ [field]: formText(form, field) }, trade.id)}>
        <Field
          label={label}
          htmlFor={field}
          hint={hint}
          required={f.isRequired(field)}
          error={f.isMissing(field) ? missingText : null}
        >
          <Textarea id={field} name={field} rows={5} defaultValue={trade[field]} disabled={readOnly} />
        </Field>
      </SectionForm>
    </Section>
  );
}

// 5 ─────────────────────────────────────────────────────────────────────

function LockedHint() {
  return (
    <p className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-muted">
      <Lock aria-hidden className="size-4" />
      These fields are locked because the trade is closed. Unlock the trade to edit them.
    </p>
  );
}

function RiskSection() {
  const { ws, locked, readOnly } = useWorkspace();
  const f = useFieldState();
  const { trade, metrics } = ws;
  const spec = CONTRACT_SPECS[trade.root];
  const tick = spec.tickSize;
  const fills = metrics.fills;

  const priceField = (
    name: "plannedEntry" | "plannedStop" | "plannedTarget" | "finalStop" | "finalTarget",
    label: string,
    requirable?: RequirableField,
  ) => (
    <Field
      label={label}
      htmlFor={name}
      required={requirable ? f.isRequired(requirable) : false}
      error={requirable && f.isMissing(requirable) ? missingText : null}
    >
      <Input
        id={name}
        name={name}
        type="number"
        step={tick}
        required={name === "plannedEntry"}
        defaultValue={trade[name] ?? ""}
        className="font-mono"
      />
    </Field>
  );

  return (
    <Section
      number={5}
      title="Risk"
      defaultOpen
      incomplete={f.anyMissing("plannedStop", "plannedTarget", "finalStop", "finalTarget")}
    >
      <SectionForm
        resetKey={trade.updatedAt}
        disabled={locked}
        onSave={(form) =>
          save(
            {
              symbol: formText(form, "symbol"),
              direction: formText(form, "direction") as Direction | undefined,
              plannedEntry: formNumber(form, "plannedEntry") ?? undefined,
              plannedStop: formNumber(form, "plannedStop"),
              plannedTarget: formNumber(form, "plannedTarget"),
              plannedContracts: formNumber(form, "plannedContracts") ?? undefined,
              finalStop: formNumber(form, "finalStop"),
              finalTarget: formNumber(form, "finalTarget"),
              fees: blankToZero(formNumber(form, "fees")),
              openedAt: form.has("openedAt")
                ? (fromDateTimeLocal(String(form.get("openedAt"))) ?? undefined)
                : undefined,
            },
            trade.id,
          )
        }
      >
        {locked && <LockedHint />}
        <fieldset disabled={locked || readOnly} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Contract" htmlFor="symbol" hint={spec.name}>
              <Input id="symbol" name="symbol" required defaultValue={trade.symbol} className="font-mono uppercase" />
            </Field>
            <Field label="Direction" htmlFor="direction">
              <Select id="direction" name="direction" defaultValue={trade.direction}>
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </Select>
            </Field>
            <Field label="Planned contracts" htmlFor="plannedContracts">
              <Input
                id="plannedContracts"
                name="plannedContracts"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={trade.plannedContracts}
              />
            </Field>
            <Field label="Opened" htmlFor="openedAt">
              <Input
                id="openedAt"
                name="openedAt"
                type="datetime-local"
                step={1}
                required
                defaultValue={toDateTimeLocal(trade.openedAt)}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {priceField("plannedEntry", "Planned entry")}
            {priceField("plannedStop", "Planned stop", "plannedStop")}
            {priceField("plannedTarget", "Planned target", "plannedTarget")}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {priceField("finalStop", "Final stop", "finalStop")}
            {priceField("finalTarget", "Final target", "finalTarget")}
            <Field label="Fees & commissions (USD)" htmlFor="fees">
              <Input id="fees" name="fees" type="number" min={0} step={0.01} defaultValue={trade.fees} />
            </Field>
          </div>
        </fieldset>
      </SectionForm>

      <div className="mt-6">
        <h3 className="text-sm font-medium">Planned vs actual</h3>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th scope="col" className="py-1.5 font-medium" />
              <th scope="col" className="py-1.5 text-right font-medium">Planned</th>
              <th scope="col" className="py-1.5 text-right font-medium">Actual</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <Row label="Risk" planned={money(metrics.plannedRisk)} actual={money(metrics.actualRisk)} />
            <Row label="Size" planned={String(trade.plannedContracts)} actual={fills ? String(fills.maxOpenQuantity) : "—"} />
            <Row label="Entry" planned={formatPrice(trade.plannedEntry)} actual={formatPrice(fills?.averageEntry ?? null)} />
            <Row label="Exit" planned={formatPrice(trade.plannedTarget)} actual={formatPrice(fills?.averageExit ?? null)} />
            <Row label="Fees" planned="—" actual={formatMoney(trade.fees)} />
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          1R = initial planned risk. Actual risk uses the average entry, the final stop (or planned stop) and the
          largest position held.
        </p>
      </div>
    </Section>
  );
}

function blankToZero(value: number | null | undefined): number | undefined {
  return value === null ? 0 : value;
}

function money(value: number | null): string {
  return value === null ? "—" : formatMoney(value);
}

function Row({ label, planned, actual }: { label: string; planned: string; actual: string }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-1.5 text-left font-sans font-normal text-muted">
        {label}
      </th>
      <td className="py-1.5 text-right">{planned}</td>
      <td className="py-1.5 text-right">{actual}</td>
    </tr>
  );
}

// 6 ─────────────────────────────────────────────────────────────────────

const PHASE_FIELD: Record<PsychologyPhase, RequirableField> = {
  BEFORE: "psychologyBefore",
  DURING: "psychologyDuring",
  AFTER: "psychologyAfter",
};

function PsychologyPhaseForm({ phase }: { phase: PsychologyPhase }) {
  const { ws, readOnly } = useWorkspace();
  const f = useFieldState();
  const entry = ws.psychology.find((e) => e.phase === phase);
  const emotions = [...new Set([...ws.settings.psychologyEmotions, ...(entry?.emotions ?? [])])];
  const ratings = [...new Set([...ws.settings.psychologyRatings, ...Object.keys(entry?.ratings ?? {})])];
  const id = (s: string) => `${phase}-${s}`.replace(/\W+/g, "-");
  const field = PHASE_FIELD[phase];

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {PSYCHOLOGY_PHASE_LABELS[phase]}
        {f.isRequired(field) && <span className="text-xs font-normal text-muted">(required to close)</span>}
        {f.isMissing(field) && <span className="text-xs font-normal text-negative">{missingText}</span>}
      </h3>
      <SectionForm
        resetKey={entry?.updatedAt ?? "new"}
        onSave={(form) =>
          savePsychology(getRepositories(), ws.trade.id, phase, {
            emotions: form.getAll("emotions").map(String),
            ratings: Object.fromEntries(
              ratings.flatMap((r) => {
                const v = form.get(`rating:${r}`);
                return v ? [[r, Number(v)]] : [];
              }),
            ),
            text: String(form.get("text") ?? ""),
          })
        }
      >
        <fieldset disabled={readOnly} className="mt-3 space-y-4">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted">Emotions</legend>
            <div className="flex flex-wrap gap-1.5">
              {emotions.map((emotion) => (
                <label
                  key={emotion}
                  className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs transition has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:font-medium has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                >
                  <input
                    type="checkbox"
                    name="emotions"
                    value={emotion}
                    defaultChecked={entry?.emotions.includes(emotion)}
                    className="sr-only"
                  />
                  {emotion}
                </label>
              ))}
            </div>
          </fieldset>

          {ratings.map((rating) => (
            <fieldset key={rating}>
              <legend className="mb-1.5 text-xs font-medium text-muted">{rating} (1–5)</legend>
              <div className="flex gap-1">
                {["", "1", "2", "3", "4", "5"].map((v) => (
                  <label
                    key={v}
                    className={cn(
                      "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-xs transition has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:font-semibold has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                      v === "" && "text-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name={`rating:${rating}`}
                      value={v}
                      defaultChecked={v === "" ? entry?.ratings[rating] === undefined : entry?.ratings[rating] === Number(v)}
                      className="sr-only"
                    />
                    {v === "" ? "–" : v}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <Field label="Notes" htmlFor={id("text")}>
            <Textarea id={id("text")} name="text" rows={3} defaultValue={entry?.text ?? ""} />
          </Field>
        </fieldset>
      </SectionForm>
    </div>
  );
}

function PsychologySection() {
  const f = useFieldState();
  return (
    <Section
      number={6}
      title="Psychology"
      incomplete={f.anyMissing("psychologyBefore", "psychologyDuring", "psychologyAfter")}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {(["BEFORE", "DURING", "AFTER"] as const).map((phase) => (
          <PsychologyPhaseForm key={phase} phase={phase} />
        ))}
      </div>
    </Section>
  );
}

// 7 ─────────────────────────────────────────────────────────────────────

function ExecutionSection() {
  const { ws, readOnly } = useWorkspace();
  const f = useFieldState();
  const { trade } = ws;
  return (
    <Section number={7} title="Execution" incomplete={f.anyMissing("executionRating", "executionNotes")}>
      <SectionForm
        resetKey={trade.updatedAt}
        onSave={(form) =>
          save(
            {
              executionRating: formNumber(form, "executionRating"),
              executionNotes: formText(form, "executionNotes"),
            },
            trade.id,
          )
        }
      >
        <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-3">
          <Field
            label="Execution rating"
            htmlFor="executionRating"
            hint="How well you executed your plan, regardless of outcome."
            required={f.isRequired("executionRating")}
            error={f.isMissing("executionRating") ? missingText : null}
          >
            <Select id="executionRating" name="executionRating" defaultValue={trade.executionRating ?? ""}>
              <option value="">—</option>
              <option value="1">1 · Poor</option>
              <option value="2">2</option>
              <option value="3">3 · OK</option>
              <option value="4">4</option>
              <option value="5">5 · Excellent</option>
            </Select>
          </Field>
          <Field
            label="Execution notes"
            htmlFor="executionNotes"
            className="md:col-span-2"
            required={f.isRequired("executionNotes")}
            error={f.isMissing("executionNotes") ? missingText : null}
          >
            <Textarea id="executionNotes" name="executionNotes" rows={3} defaultValue={trade.executionNotes} />
          </Field>
        </fieldset>
      </SectionForm>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────

export function TradeSections() {
  return (
    <div className="space-y-3">
      <MarketDataSection />
      <TextSection
        number={2}
        title="Trade reasoning"
        field="reasoning"
        label="Why did you take this trade?"
        hint="Thesis, trigger and what would prove you wrong."
      />
      <Section number={3} title="Forecast / context">
        <LaterPhase phase={4}>Link this trade to a daily forecast and scenario.</LaterPhase>
      </Section>
      <SetupSection number={4} />
      <RiskSection />
      <PsychologySection />
      <ExecutionSection />
      <ScreenshotsSection number={8} />
      <TextSection number={9} title="Notes" field="notes" label="Notes" />
      <RulesChecklistSection number={10} />
    </div>
  );
}
