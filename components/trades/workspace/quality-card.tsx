"use client";

import { Card } from "@/components/ui/card";
import { AUTO_VIOLATION_LABELS } from "@/lib/calculations/process-checks";
import { PROCESS_OUTCOME_LABELS, QUALITY_WEIGHTS, type QualityComponents } from "@/lib/calculations/quality";
import { cn } from "@/lib/ui/cn";
import { useWorkspace } from "./context";

const COMPONENT_LABELS: Record<keyof QualityComponents, string> = {
  rules: "Rule adherence",
  execution: "Execution",
  risk: "Risk management",
};

export function QualityCard() {
  const { ws } = useWorkspace();
  const { quality, trade } = ws;
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Trade quality</h2>
          <p className="text-xs text-muted">Scored on process, not on profit.</p>
        </div>
        <p className="text-right">
          <span className="font-mono text-2xl font-semibold tabular-nums">{quality.score ?? "—"}</span>
          {quality.grade && <span className="ml-1.5 text-sm font-semibold text-muted">{quality.grade}</span>}
        </p>
      </div>
      {quality.processOutcome && (
        <p className="rounded-md bg-surface-muted px-3 py-1.5 text-sm font-medium">
          {PROCESS_OUTCOME_LABELS[quality.processOutcome]}
        </p>
      )}
      <dl className="space-y-2.5">
        {(Object.keys(COMPONENT_LABELS) as (keyof QualityComponents)[]).map((key) => {
          const value = quality.components[key];
          return (
            <div key={key}>
              <div className="flex justify-between text-xs">
                <dt>
                  {COMPONENT_LABELS[key]} <span className="text-muted">· {Math.round(QUALITY_WEIGHTS[key] * 100)}%</span>
                </dt>
                <dd className="font-mono tabular-nums">{value ?? "not scored"}</dd>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                {value !== null && (
                  <div
                    className={cn("h-full rounded-full", value >= 70 ? "bg-positive" : value >= 55 ? "bg-muted" : "bg-negative")}
                    style={{ width: `${value}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </dl>
      {quality.autoViolations.length > 0 && (
        <div>
          <h3 className="text-xs font-medium">Found in the trade data</h3>
          <ul className="mt-1 space-y-1 text-xs" aria-label="Violations found in the trade data">
            {quality.autoViolations.map((v) => (
              <li key={v.kind} className="rounded-md border border-negative/40 px-2 py-1">
                <span className="font-medium">{AUTO_VIOLATION_LABELS[v.kind]}</span>{" "}
                <span className="text-muted">· {v.severity.toLowerCase()} · {v.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {quality.notes.map((note) => (
        <p key={note} className="rounded-md bg-surface-muted px-3 py-1.5 text-xs">
          {note}
        </p>
      ))}
      {trade.stopAtEntry === null && (
        <p className="text-xs text-muted">Record whether a stop was attached at entry (Execution) to complete risk scoring.</p>
      )}
      <p className="text-xs text-muted">
        Unscored parts are left out: answer the checklist, rate execution and plan a stop to complete the score.
      </p>
    </Card>
  );
}
