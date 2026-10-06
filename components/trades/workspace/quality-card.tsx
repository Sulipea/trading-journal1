"use client";

import { Card } from "@/components/ui/card";
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
  const { quality } = ws;
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
      <p className="text-xs text-muted">
        Unscored parts are left out: answer the checklist, rate execution and plan a stop to complete the score.
      </p>
    </Card>
  );
}
