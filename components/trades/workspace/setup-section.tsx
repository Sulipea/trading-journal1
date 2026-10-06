"use client";

import Link from "next/link";
import { CheckCircle2, Lightbulb, SkipForward } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, FormStatus, Input, Select } from "@/components/ui/form";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import type { RequirableField } from "@/lib/domain/types";
import { getRepositories } from "@/lib/repositories";
import { setTradeSetup, skipRequirement, unskipRequirement } from "@/lib/services/trade-rules";
import { errorMessage } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";
import { Section } from "./section";

type Status = { kind: "saved" | "error"; message: string } | null;

export function SetupSection({ number }: { number: number }) {
  const { ws, readOnly, reload } = useWorkspace();
  const { trade, setup, setups, readiness, settings } = ws;
  const [status, setStatus] = useState<Status>(null);
  const [skipping, setSkipping] = useState<RequirableField | null>(null);
  const choices = setups.filter((s) => s.active || s.id === trade.setupId);
  const setupOnly = (setup?.requiredFields ?? []).filter((f) => !settings.requiredFields.includes(f));
  const incomplete = trade.status !== "CLOSED" && readiness.overridable.length > 0;

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      setStatus({ kind: "saved", message });
      setSkipping(null);
      reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function onChoose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = String(new FormData(event.currentTarget).get("setupId") ?? "") || null;
    await run(() => setTradeSetup(getRepositories(), trade.id, id), id ? "Setup saved." : "Setup cleared.");
  }

  return (
    <Section number={number} title="Setup" incomplete={incomplete} defaultOpen={!trade.setupId && !readOnly}>
      <div className="space-y-4">
        {ws.suggestedSetup && !readOnly && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/8 px-3 py-2 text-sm">
            <Lightbulb aria-hidden className="size-4 text-accent" />
            <span>
              Your notes mention <span className="font-medium">{ws.suggestedSetup.name}</span>.
            </span>
            <Button
              className="ml-auto py-1 text-xs"
              onClick={() =>
                run(() => setTradeSetup(getRepositories(), trade.id, ws.suggestedSetup!.id), "Setup saved.")
              }
            >
              Use this setup
            </Button>
          </div>
        )}

        <form key={trade.setupId ?? "none"} onSubmit={onChoose} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <label htmlFor="setupId" className="block text-sm font-medium">
              Setup
            </label>
            <Select id="setupId" name="setupId" defaultValue={trade.setupId ?? ""} disabled={readOnly}>
              <option value="">— No setup —</option>
              {choices.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.active}>
                  {s.name}
                  {!s.active ? " (archived)" : ""}
                </option>
              ))}
            </Select>
          </div>
          {!readOnly && (
            <Button type="submit" variant="primary">
              Save
            </Button>
          )}
          <Link href="/setups" className="pb-2 text-sm text-accent hover:underline">
            Manage setups
          </Link>
        </form>
        <FormStatus status={status} />

        {setup && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <Link href={`/setups/${setup.id}`} className="font-medium hover:underline">
                {setup.name}
              </Link>
              <span className="text-xs text-muted"> · {setup.category}</span>
              {setup.description && <p className="mt-1 line-clamp-3 text-sm text-muted">{setup.description}</p>}
            </div>

            <div>
              <h3 className="text-sm font-medium">This setup also requires</h3>
              {setupOnly.length === 0 ? (
                <p className="text-sm text-muted">Nothing beyond the global requirements.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {setupOnly.map((field) => {
                    const skipped = trade.requirementOverrides.find((o) => o.field === field);
                    const missing = readiness.overridable.includes(field);
                    return (
                      <li key={field} className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          {skipped ? (
                            <SkipForward aria-hidden className="size-4 text-muted" />
                          ) : missing ? (
                            <span aria-hidden className="size-4 rounded-full border-2 border-negative" />
                          ) : (
                            <CheckCircle2 aria-hidden className="size-4 text-positive" />
                          )}
                          <span className={skipped ? "text-muted line-through" : ""}>{REQUIRABLE_FIELD_LABELS[field]}</span>
                          <span className="text-xs text-muted">
                            {skipped ? "skipped" : missing ? "missing" : "complete"}
                          </span>
                          {!readOnly && missing && skipping !== field && (
                            <Button className="ml-auto px-2 py-1 text-xs" onClick={() => setSkipping(field)}>
                              Skip with reason
                            </Button>
                          )}
                          {!readOnly && skipped && (
                            <Button
                              className="ml-auto px-2 py-1 text-xs"
                              onClick={() =>
                                run(() => unskipRequirement(getRepositories(), trade.id, field), "Requirement restored.")
                              }
                            >
                              Restore requirement
                            </Button>
                          )}
                        </div>
                        {skipped && <p className="ml-6 text-xs text-muted">Reason: {skipped.reason}</p>}
                        {skipping === field && (
                          <SkipForm
                            field={field}
                            onCancel={() => setSkipping(null)}
                            onSkip={(reason) =>
                              run(() => skipRequirement(getRepositories(), trade.id, field, reason), "Requirement skipped.")
                            }
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {setupOnly.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Skipping a setup requirement needs a reason and counts as a process violation in trade quality.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function SkipForm({
  field,
  onSkip,
  onCancel,
}: {
  field: RequirableField;
  onSkip: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-2 ml-6 flex flex-wrap gap-2">
      <Input
        aria-label={`Reason for skipping ${REQUIRABLE_FIELD_LABELS[field]}`}
        placeholder="Why are you skipping this?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-w-64 flex-1"
        autoFocus
      />
      <Button variant="primary" disabled={!reason.trim()} onClick={() => onSkip(reason)}>
        Skip requirement
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </div>
  );
}
