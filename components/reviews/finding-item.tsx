"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { TradeEvidence } from "@/components/analytics/trade-evidence";
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import type { EntityId, FindingKind, ReviewFinding } from "@/lib/domain/types";
import { cn } from "@/lib/ui/cn";

export const KIND_LABELS: Record<FindingKind, string> = {
  OBSERVATION: "Data-backed observation",
  PATTERN: "Possible pattern",
  QUESTION: "Review question",
};

export function KindBadge({ kind }: { kind: FindingKind }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        kind === "OBSERVATION" && "bg-surface-muted text-muted",
        kind === "PATTERN" && "bg-accent/15 text-accent",
        kind === "QUESTION" && "border border-border text-foreground",
      )}
    >
      {KIND_LABELS[kind]}
    </span>
  );
}

/** One review finding: what it says, what kind of claim it is, and the trades behind it. */
export function FindingItem({
  finding,
  rows,
  timezone,
  onToggleImportant,
}: {
  finding: ReviewFinding;
  rows: ReadonlyMap<EntityId, AnalyticsRow>;
  timezone: string;
  onToggleImportant: (important: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const evidence = finding.tradeIds.flatMap((id) => rows.get(id) ?? []);
  return (
    <li className={cn("flex gap-3 py-3", finding.stale && "opacity-70")}>
      <button
        type="button"
        aria-pressed={finding.important}
        aria-label={finding.important ? "Unmark as important" : "Mark as important"}
        title={finding.important ? "Important" : "Mark as important"}
        onClick={() => onToggleImportant(!finding.important)}
        className="mt-0.5 h-fit rounded p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Star aria-hidden className={cn("size-4", finding.important ? "fill-accent text-accent" : "text-muted")} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={finding.kind} />
          {finding.stale && (
            <span className="text-[11px] text-muted" title="Kept because you marked it important">
              No longer produced by the current data
            </span>
          )}
        </div>
        <p className={cn("mt-1 text-sm font-medium", finding.kind === "QUESTION" && "italic")}>{finding.title}</p>
        {finding.detail && <p className="mt-0.5 text-sm text-muted">{finding.detail}</p>}
        {evidence.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="mt-1 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {open ? "Hide" : "Show"} {evidence.length} supporting trade{evidence.length === 1 ? "" : "s"}
            </button>
            {open && (
              <div className="mt-2">
                <TradeEvidence rows={evidence} timezone={timezone} />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
