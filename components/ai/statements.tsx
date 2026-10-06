import Link from "next/link";
import { checkStatements, type AILabel, type AIStatement } from "@/lib/ai/schemas";
import type { EntityId } from "@/lib/domain/types";
import { cn } from "@/lib/ui/cn";

export const AI_LABEL_TEXT: Record<AILabel, string> = {
  DATA_BACKED_OBSERVATION: "Data-backed observation",
  INTERPRETATION: "Interpretation",
  POSSIBLE_PATTERN: "Possible pattern / correlation",
  REVIEW_QUESTION: "Review question",
};

export function AILabelBadge({ label }: { label: AILabel }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
        label === "DATA_BACKED_OBSERVATION" && "bg-surface-muted text-muted",
        label === "INTERPRETATION" && "border border-dashed border-muted text-muted",
        label === "POSSIBLE_PATTERN" && "bg-accent/15 text-accent",
        label === "REVIEW_QUESTION" && "border border-border text-foreground",
      )}
    >
      {AI_LABEL_TEXT[label]}
    </span>
  );
}

/**
 * AI statements with their label, evidence and links to the cited trades.
 * Re-checks every statement against the trades that were actually sent.
 */
export function StatementList({
  statements,
  refs,
  currentTradeId,
}: {
  statements: readonly AIStatement[];
  /** Short reference → trade id, as sent with the request. */
  refs: Readonly<Record<string, EntityId>>;
  /** Don't link to the trade being viewed. */
  currentTradeId?: EntityId;
}) {
  const checked = checkStatements(statements, new Set(Object.keys(refs)));
  if (checked.length === 0) return <p className="text-sm text-muted">Nothing to add here.</p>;
  return (
    <ul className="space-y-3">
      {checked.map((s, i) => (
        <li key={i} className="text-sm">
          <AILabelBadge label={s.label} />
          <p className={cn("mt-1", s.label === "REVIEW_QUESTION" && "italic", s.label === "INTERPRETATION" && "text-muted")}>{s.text}</p>
          {s.evidence && <p className="mt-0.5 text-xs text-muted">Evidence: {s.evidence}</p>}
          {s.refs.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
              <span className="text-muted">Trades:</span>
              {s.refs.map((ref) =>
                refs[ref] === currentTradeId ? (
                  <span key={ref} className="font-mono">
                    {ref} (this trade)
                  </span>
                ) : (
                  <Link key={ref} href={`/trades/${refs[ref]}`} className="font-mono text-accent hover:underline">
                    {ref}
                  </Link>
                ),
              )}
            </p>
          )}
          {s.downgraded && <p className="mt-0.5 text-xs text-muted">Shown as an interpretation: it cited no trades or figures.</p>}
          {s.unknownRefs.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">Ignored references to trades that weren&apos;t provided: {s.unknownRefs.join(", ")}.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
