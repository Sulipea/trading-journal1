import { Flag } from "lucide-react";
import type { TradeQuality } from "@/lib/calculations/quality";
import { PROCESS_OUTCOME_LABELS } from "@/lib/calculations/quality";
import { SEVERITY_LABELS } from "@/lib/domain/checklist";
import type { RuleSeverity } from "@/lib/domain/types";
import { cn } from "@/lib/ui/cn";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

export function SeverityBadge({ severity }: { severity: RuleSeverity }) {
  return (
    <span
      className={cn(
        pill,
        severity === "HIGH" && "bg-negative/15 text-negative",
        severity === "MEDIUM" && "bg-accent/15 text-accent",
        severity === "LOW" && "bg-surface-muted text-muted",
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function QualityBadge({ quality }: { quality: TradeQuality }) {
  if (quality.score === null) return <span className="text-muted">—</span>;
  return (
    <span
      className={cn(
        pill,
        "font-mono",
        quality.score >= 70 ? "bg-positive/12 text-positive" : quality.score >= 55 ? "bg-surface-muted" : "bg-negative/12 text-negative",
      )}
      title={quality.processOutcome ? PROCESS_OUTCOME_LABELS[quality.processOutcome] : undefined}
    >
      {quality.grade} · {quality.score}
    </span>
  );
}

export function ReviewFlag() {
  return (
    <span className={cn(pill, "bg-negative/12 text-negative")}>
      <Flag aria-hidden className="size-3" />
      Review
    </span>
  );
}
