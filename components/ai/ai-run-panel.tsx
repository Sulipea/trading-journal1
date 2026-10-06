"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, FormStatus } from "@/components/ui/form";
import type { AIReview } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import type { JournalRepositories } from "@/lib/repositories";
import { useAIState } from "@/lib/ui/ai";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { AIUnavailable } from "./ai-gate";

/**
 * A card that runs one kind of AI analysis on demand and lists the stored
 * results, newest first. `renderOutput` draws a successful result.
 */
export function AIRunPanel({
  title,
  description,
  runLabel,
  load,
  run,
  renderOutput,
  timezone,
}: {
  title: string;
  description: string;
  runLabel: string;
  /** Must be stable (useCallback) — it is re-run whenever it changes. */
  load: (repos: JournalRepositories) => Promise<AIReview[]>;
  run: () => Promise<unknown>;
  renderOutput: (review: AIReview) => ReactNode;
  timezone: string;
}) {
  const ai = useAIState();
  const results = useJournalQuery(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = ai.status === "ready" && ai.data.status === "ENABLED";
  const list = results.status === "ready" ? results.data : [];

  async function onRun() {
    setBusy(true);
    setError(null);
    try {
      await run();
      results.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles aria-hidden className="size-4 text-accent" />
          {title}
        </h2>
        <p className="text-xs text-muted">{description}</p>
      </div>
      {ai.status === "ready" && !enabled && <AIUnavailable status={ai.data.status} />}
      {enabled && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={busy} onClick={onRun}>
            <Sparkles aria-hidden className="size-4" />
            {busy ? "Working…" : runLabel}
          </Button>
          <FormStatus status={error ? { kind: "error", message: error } : null} />
        </div>
      )}
      {list.map((review, i) => (
        <Result key={review.id} review={review} timezone={timezone} defaultOpen={i === 0} renderOutput={renderOutput} />
      ))}
    </Card>
  );
}

function Result({
  review,
  timezone,
  defaultOpen,
  renderOutput,
}: {
  review: AIReview;
  timezone: string;
  defaultOpen: boolean;
  renderOutput: (review: AIReview) => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight aria-hidden className={`size-3.5 transition ${open ? "rotate-90" : ""}`} />
        {formatDateTime(review.createdAt, timezone)}
        {review.status === "COMPLETE" ? ` · ${review.model}` : " · failed"}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {review.status === "FAILED" ? (
            <p className="text-sm text-negative" role="alert">
              {review.error} Nothing in your journal was changed.
            </p>
          ) : (
            renderOutput(review)
          )}
        </div>
      )}
    </div>
  );
}

export function OutputSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
