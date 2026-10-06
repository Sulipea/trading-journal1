"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SeverityBadge } from "@/components/rules/badges";
import { Button, Field, FormStatus, Input, Select, Textarea } from "@/components/ui/form";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import { SETUP_CATEGORIES, requirableFieldSchema } from "@/lib/domain/schemas";
import type { RequirableField, Rule, Setup, SetupCategory } from "@/lib/domain/types";
import { getRepositories } from "@/lib/repositories";
import { createSetup, updateSetup, type SetupInput } from "@/lib/services/setups";
import { errorMessage } from "@/lib/ui/use-journal";

export interface SetupFormInitial {
  name: string;
  description: string;
  category: SetupCategory;
  tags: string[];
  requiredFields: RequirableField[];
  ruleIds: string[];
}

export function setupToInitial(setup: Setup, rules: readonly Rule[]): SetupFormInitial {
  return {
    name: setup.name,
    description: setup.description,
    category: setup.category,
    tags: setup.tags,
    requiredFields: setup.requiredFields,
    ruleIds: rules.map((r) => r.id),
  };
}

export function SetupForm({
  setupId,
  initial,
  allRules,
  globalRequired,
  onSaved,
}: {
  /** Omit to create a new setup. */
  setupId?: string;
  initial: SetupFormInitial;
  allRules: readonly Rule[];
  /** Fields already required for every trade; shown as such. */
  globalRequired: readonly RequirableField[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep the chosen checklist order: previously chosen first, newly ticked appended.
  const [ruleIds, setRuleIds] = useState<string[]>(initial.ruleIds);
  const selectable = allRules.filter((r) => r.active || initial.ruleIds.includes(r.id));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: SetupInput = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      category: String(form.get("category")) as SetupCategory,
      tags: String(form.get("tags") ?? "").split(","),
      requiredFields: form.getAll("requiredFields").map(String) as RequirableField[],
      ruleIds,
    };
    if (!input.name.trim()) return setError("Give the setup a name.");
    setBusy(true);
    setError(null);
    try {
      if (setupId) {
        await updateSetup(getRepositories(), setupId, input);
        onSaved?.();
      } else {
        const setup = await createSetup(getRepositories(), input);
        router.push(`/setups/${setup.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Name" htmlFor="setup-name" className="md:col-span-2">
          <Input id="setup-name" name="name" required defaultValue={initial.name} />
        </Field>
        <Field label="Category" htmlFor="setup-category">
          <Select id="setup-category" name="category" defaultValue={initial.category}>
            {SETUP_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="setup-description" hint="What the setup is, when it's valid, how you enter and exit.">
        <Textarea id="setup-description" name="description" rows={4} defaultValue={initial.description} />
      </Field>
      <Field label="Tags" htmlFor="setup-tags" hint="Comma-separated, e.g. vwap, opening, trend.">
        <Input id="setup-tags" name="tags" defaultValue={initial.tags.join(", ")} />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Required to close a trade with this setup</legend>
        <p className="mt-0.5 text-xs text-muted">
          Unticked fields stay optional. A trader can skip a setup requirement only by giving a reason, which counts as
          a process violation.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {requirableFieldSchema.options.map((field) => {
            const global = globalRequired.includes(field);
            return (
              <label key={field} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="requiredFields"
                  value={field}
                  defaultChecked={global || initial.requiredFields.includes(field)}
                  disabled={global}
                  className="size-4 accent-[var(--accent)]"
                />
                {REQUIRABLE_FIELD_LABELS[field]}
                {global && <span className="text-xs text-muted">(always required)</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Checklist rules</legend>
        <p className="mt-0.5 text-xs text-muted">
          Rules for &ldquo;All trades&rdquo; are always on the checklist. Tick extra rules for this setup.
        </p>
        {selectable.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No rules yet — create them on the Rules page.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {selectable.map((rule) => {
              const always = rule.appliesTo === "ALL";
              return (
                <li key={rule.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={always || ruleIds.includes(rule.id)}
                      disabled={always}
                      onChange={(e) =>
                        setRuleIds((ids) => (e.target.checked ? [...ids, rule.id] : ids.filter((id) => id !== rule.id)))
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                    {rule.name}
                    <SeverityBadge severity={rule.severity} />
                    {always && <span className="text-xs text-muted">(all trades)</span>}
                    {!rule.active && <span className="text-xs text-muted">(inactive)</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : setupId ? "Save setup" : "Create setup"}
        </Button>
        <FormStatus status={error ? { kind: "error", message: error } : null} />
      </div>
    </form>
  );
}
