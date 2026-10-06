"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Field, FormStatus, Input, Select, Textarea } from "@/components/ui/form";
import { newId } from "@/lib/domain/ids";
import { INSTRUMENT_ROOTS, type InstrumentRoot } from "@/lib/domain/instruments";
import {
  biasSchema,
  confidenceSchema,
  gexRegimeSchema,
  levelPrioritySchema,
  levelReactionSchema,
  levelTypeSchema,
} from "@/lib/domain/schemas";
import type {
  Bias,
  Confidence,
  ForecastContent,
  ForecastKeyLevel,
  ForecastScenario,
  GexRegime,
  LevelPriority,
  LevelReaction,
  LevelType,
  Setup,
} from "@/lib/domain/types";
import { errorMessage } from "@/lib/ui/use-journal";
import {
  BIAS_LABELS,
  CONFIDENCE_LABELS,
  GEX_LABELS,
  LEVEL_TYPE_LABELS,
  PRIORITY_LABELS,
  REACTION_LABELS,
} from "./labels";

function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Drop links to scenarios or levels that were removed while editing. */
function withoutDanglingReferences(content: ForecastContent): ForecastContent {
  const scenarioIds = new Set(content.scenarios.map((s) => s.id));
  const levelIds = new Set(content.keyLevels.map((l) => l.id));
  return {
    ...content,
    conditionTags: content.conditionTags.map((t) => t.trim()).filter(Boolean),
    scenarios: content.scenarios.map((s) => ({ ...s, levelIds: s.levelIds.filter((id) => levelIds.has(id)) })),
    keyLevels: content.keyLevels.map((l) => ({
      ...l,
      scenarioId: l.scenarioId !== null && scenarioIds.has(l.scenarioId) ? l.scenarioId : null,
    })),
  };
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * Edits a full forecast content. Used for the draft and for revisions.
 * `extra` renders above the submit button (e.g. the revision reason).
 */
export function ForecastEditor({
  initial,
  setups,
  submitLabel,
  onSubmit,
  onCancel,
  extra,
  secondary,
}: {
  initial: ForecastContent;
  setups: readonly Setup[];
  submitLabel: string;
  onSubmit: (content: ForecastContent) => Promise<unknown>;
  onCancel?: () => void;
  extra?: ReactNode;
  /** A second button that receives the current (unsaved) content, e.g. "Finalize". */
  secondary?: { label: ReactNode; onClick: (content: ForecastContent) => void };
}) {
  const [content, setContent] = useState<ForecastContent>(() => structuredClone(initial));
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ForecastContent>) => setContent((c) => ({ ...c, ...patch }));
  const choosable = setups.filter((s) => s.active || content.setupIds.includes(s.id));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (content.keyLevels.some((l) => Number.isNaN(l.price))) {
      setStatus({ kind: "error", message: "Every key level needs a price." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await onSubmit(withoutDanglingReferences(content));
      setStatus({ kind: "saved", message: "Saved." });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Bias" htmlFor="fc-bias">
          <Select id="fc-bias" value={content.bias} onChange={(e) => set({ bias: e.target.value as Bias })}>
            {biasSchema.options.map((b) => (
              <option key={b} value={b}>
                {BIAS_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Confidence" htmlFor="fc-confidence">
          <Select
            id="fc-confidence"
            value={content.confidence}
            onChange={(e) => set({ confidence: e.target.value as Confidence })}
          >
            {confidenceSchema.options.map((c) => (
              <option key={c} value={c}>
                {CONFIDENCE_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Confidence score (0–100)" htmlFor="fc-score" hint="Optional.">
          <Input
            id="fc-score"
            type="number"
            min={0}
            max={100}
            step={1}
            value={content.confidenceScore ?? ""}
            onChange={(e) => set({ confidenceScore: numberOrNull(e.target.value) })}
          />
        </Field>
        <div />
        <Field label="GEX regime" htmlFor="fc-gex">
          <Select
            id="fc-gex"
            value={content.gexRegime ?? ""}
            onChange={(e) => set({ gexRegime: (e.target.value || null) as GexRegime | null })}
          >
            <option value="">—</option>
            {gexRegimeSchema.options.map((g) => (
              <option key={g} value={g}>
                {GEX_LABELS[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="GEX value" htmlFor="fc-gex-value" hint="Entered manually.">
          <Input
            id="fc-gex-value"
            type="number"
            step="any"
            value={content.gexValue ?? ""}
            onChange={(e) => set({ gexValue: numberOrNull(e.target.value) })}
            className="font-mono"
          />
        </Field>
        <Field label="Condition tags" htmlFor="fc-tags" hint="Comma-separated, e.g. Trending, High volatility." className="md:col-span-2">
          <Input
            id="fc-tags"
            value={content.conditionTags.join(", ")}
            onChange={(e) => set({ conditionTags: e.target.value.split(",").map((t) => t.trimStart()) })}
            onBlur={() => set({ conditionTags: content.conditionTags.map((t) => t.trim()).filter(Boolean) })}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Market conditions" htmlFor="fc-conditions">
          <Textarea
            id="fc-conditions"
            rows={3}
            value={content.marketConditions}
            onChange={(e) => set({ marketConditions: e.target.value })}
          />
        </Field>
        <Field label="Invalidation" htmlFor="fc-invalidation" hint="What would prove this forecast wrong?">
          <Textarea
            id="fc-invalidation"
            rows={3}
            value={content.invalidation}
            onChange={(e) => set({ invalidation: e.target.value })}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Setups you expect</legend>
        {choosable.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No setups yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {choosable.map((s) => (
              <Chip key={s.id} checked={content.setupIds.includes(s.id)} onChange={() => set({ setupIds: toggle(content.setupIds, s.id) })}>
                {s.name}
              </Chip>
            ))}
          </div>
        )}
      </fieldset>

      <ScenariosEditor content={content} setups={choosable} onChange={(scenarios) => set({ scenarios })} />
      <LevelsEditor content={content} onChange={(keyLevels) => set({ keyLevels })} />

      <Field label="Notes" htmlFor="fc-notes">
        <Textarea id="fc-notes" rows={3} value={content.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      {extra}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {secondary && (
          <Button
            onClick={() => {
              if (content.keyLevels.some((l) => Number.isNaN(l.price))) {
                setStatus({ kind: "error", message: "Every key level needs a price." });
                return;
              }
              secondary.onClick(withoutDanglingReferences(content));
            }}
          >
            {secondary.label}
          </Button>
        )}
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <FormStatus status={status} />
      </div>
    </form>
  );
}

function Chip({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs transition has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:font-medium has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function InstrumentChips({
  value,
  onChange,
  label,
}: {
  value: InstrumentRoot[];
  onChange: (roots: InstrumentRoot[]) => void;
  label: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs text-muted">{label} (none = all)</legend>
      <div className="flex flex-wrap gap-1">
        {INSTRUMENT_ROOTS.map((r) => (
          <Chip key={r} checked={value.includes(r)} onChange={() => onChange(toggle(value, r))}>
            {r}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

function ScenariosEditor({
  content,
  setups,
  onChange,
}: {
  content: ForecastContent;
  setups: readonly Setup[];
  onChange: (scenarios: ForecastScenario[]) => void;
}) {
  const update = (i: number, patch: Partial<ForecastScenario>) =>
    onChange(content.scenarios.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () =>
    onChange([
      ...content.scenarios,
      { id: newId(), title: "", if: "", then: "", invalidation: "", instruments: [], setupIds: [], levelIds: [], confidence: null },
    ]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Scenarios</h3>
        <Button className="text-xs" onClick={add}>
          <Plus aria-hidden className="size-3.5" /> Add scenario
        </Button>
      </div>
      {content.scenarios.length === 0 && <p className="text-sm text-muted">Add IF / THEN / INVALIDATION scenarios.</p>}
      {content.scenarios.map((s, i) => {
        const id = (name: string) => `scenario-${s.id}-${name}`;
        return (
          <div key={s.id} className="space-y-3 rounded-lg border border-border p-4" role="group" aria-label={`Scenario ${i + 1}`}>
            <div className="flex gap-3">
              <Field label="Title" htmlFor={id("title")} className="flex-1">
                <Input id={id("title")} value={s.title} onChange={(e) => update(i, { title: e.target.value })} required />
              </Field>
              <Field label="Confidence" htmlFor={id("confidence")}>
                <Select
                  id={id("confidence")}
                  value={s.confidence ?? ""}
                  onChange={(e) => update(i, { confidence: (e.target.value || null) as Confidence | null })}
                >
                  <option value="">—</option>
                  {confidenceSchema.options.map((c) => (
                    <option key={c} value={c}>
                      {CONFIDENCE_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="ghost"
                className="mt-6 self-start p-2"
                aria-label={`Remove scenario ${s.title || i + 1}`}
                onClick={() =>
                  onChange(content.scenarios.filter((_, j) => j !== i))
                }
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="IF" htmlFor={id("if")}>
                <Textarea id={id("if")} rows={2} value={s.if} onChange={(e) => update(i, { if: e.target.value })} />
              </Field>
              <Field label="THEN" htmlFor={id("then")}>
                <Textarea id={id("then")} rows={2} value={s.then} onChange={(e) => update(i, { then: e.target.value })} />
              </Field>
              <Field label="INVALIDATION" htmlFor={id("inv")}>
                <Textarea
                  id={id("inv")}
                  rows={2}
                  value={s.invalidation}
                  onChange={(e) => update(i, { invalidation: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <InstrumentChips label="Instruments" value={s.instruments} onChange={(instruments) => update(i, { instruments })} />
              <fieldset>
                <legend className="mb-1 text-xs text-muted">Setups</legend>
                <div className="flex flex-wrap gap-1">
                  {setups.map((setup) => (
                    <Chip
                      key={setup.id}
                      checked={s.setupIds.includes(setup.id)}
                      onChange={() => update(i, { setupIds: toggle(s.setupIds, setup.id) })}
                    >
                      {setup.name}
                    </Chip>
                  ))}
                  {setups.length === 0 && <span className="text-xs text-muted">None</span>}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-xs text-muted">Key levels</legend>
                <div className="flex flex-wrap gap-1">
                  {content.keyLevels.map((l) => (
                    <Chip key={l.id} checked={s.levelIds.includes(l.id)} onChange={() => update(i, { levelIds: toggle(s.levelIds, l.id) })}>
                      {l.label || l.price}
                    </Chip>
                  ))}
                  {content.keyLevels.length === 0 && <span className="text-xs text-muted">Add levels below</span>}
                </div>
              </fieldset>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function LevelsEditor({
  content,
  onChange,
}: {
  content: ForecastContent;
  onChange: (levels: ForecastKeyLevel[]) => void;
}) {
  const update = (i: number, patch: Partial<ForecastKeyLevel>) =>
    onChange(content.keyLevels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () =>
    onChange([
      ...content.keyLevels,
      {
        id: newId(),
        price: Number.NaN,
        priceTo: null,
        instruments: [],
        label: "",
        type: "SUPPORT",
        priority: "MEDIUM",
        expectedReaction: null,
        expectedNotes: "",
        scenarioId: null,
      },
    ]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Key levels &amp; zones</h3>
        <Button className="text-xs" onClick={add}>
          <Plus aria-hidden className="size-3.5" /> Add level
        </Button>
      </div>
      {content.keyLevels.length === 0 && <p className="text-sm text-muted">Add the prices you&apos;re watching.</p>}
      {content.keyLevels.map((l, i) => {
        const id = (name: string) => `level-${l.id}-${name}`;
        return (
          <div key={l.id} className="space-y-3 rounded-lg border border-border p-4" role="group" aria-label={`Key level ${i + 1}`}>
            <div className="grid gap-3 md:grid-cols-6">
              <Field label="Price" htmlFor={id("price")}>
                <Input
                  id={id("price")}
                  type="number"
                  step="any"
                  required
                  value={Number.isNaN(l.price) ? "" : l.price}
                  onChange={(e) => update(i, { price: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                  className="font-mono"
                />
              </Field>
              <Field label="Zone top" htmlFor={id("to")} hint="Optional.">
                <Input
                  id={id("to")}
                  type="number"
                  step="any"
                  value={l.priceTo ?? ""}
                  onChange={(e) => update(i, { priceTo: numberOrNull(e.target.value) })}
                  className="font-mono"
                />
              </Field>
              <Field label="Label" htmlFor={id("label")} className="md:col-span-2">
                <Input id={id("label")} value={l.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. PDH" />
              </Field>
              <Field label="Type" htmlFor={id("type")}>
                <Select id={id("type")} value={l.type} onChange={(e) => update(i, { type: e.target.value as LevelType })}>
                  {levelTypeSchema.options.map((t) => (
                    <option key={t} value={t}>
                      {LEVEL_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor={id("priority")}>
                <Select id={id("priority")} value={l.priority} onChange={(e) => update(i, { priority: e.target.value as LevelPriority })}>
                  {levelPrioritySchema.options.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <InstrumentChips label="Instruments" value={l.instruments} onChange={(instruments) => update(i, { instruments })} />
              </div>
              <Field label="Expected reaction" htmlFor={id("reaction")}>
                <Select
                  id={id("reaction")}
                  value={l.expectedReaction ?? ""}
                  onChange={(e) => update(i, { expectedReaction: (e.target.value || null) as LevelReaction | null })}
                >
                  <option value="">—</option>
                  {levelReactionSchema.options.map((r) => (
                    <option key={r} value={r}>
                      {REACTION_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Scenario" htmlFor={id("scenario")}>
                <Select
                  id={id("scenario")}
                  value={l.scenarioId ?? ""}
                  onChange={(e) => update(i, { scenarioId: e.target.value || null })}
                >
                  <option value="">—</option>
                  {content.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || "Untitled scenario"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expected notes" htmlFor={id("notes")} className="md:col-span-2">
                <div className="flex gap-2">
                  <Input id={id("notes")} value={l.expectedNotes} onChange={(e) => update(i, { expectedNotes: e.target.value })} />
                  <Button
                    variant="ghost"
                    className="p-2"
                    aria-label={`Remove level ${l.label || i + 1}`}
                    onClick={() =>
                      onChange(content.keyLevels.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </Field>
            </div>
          </div>
        );
      })}
    </section>
  );
}
