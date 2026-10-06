"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { Button, FormStatus, Textarea, buttonClass } from "@/components/ui/form";
import type { ReviewFinding } from "@/lib/domain/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/reviews/generate";
import { periodLabel } from "@/lib/reviews/periods";
import { loadReviewDetail, regenerateReview, saveReviewNotes, setFindingImportant, type ReviewDetail } from "@/lib/services/reviews";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { FindingItem } from "./finding-item";

export function ReviewDetailView({ reviewId }: { reviewId: string }) {
  const load = useCallback((repos: JournalRepositories) => loadReviewDetail(repos, reviewId), [reviewId]);
  const query = useJournalQuery(load);
  if (query.status === "loading") return <p className="text-sm text-muted">Loading review…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">This review could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
        <Link href="/reviews" className={buttonClass("secondary", "mt-4")}>
          Back to reviews
        </Link>
      </Card>
    );
  }
  return <Detail detail={query.data} reload={query.reload} />;
}

function Detail({ detail, reload }: { detail: ReviewDetail; reload: () => void }) {
  const { review, findings } = detail;
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const label = periodLabel({ kind: review.kind, start: review.periodStart });

  async function run(action: () => Promise<unknown>, message?: string) {
    try {
      await action();
      if (message) setStatus({ kind: "saved", message });
      reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function onSaveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const notes = String(new FormData(event.currentTarget).get("notes") ?? "");
    await run(() => saveReviewNotes(getRepositories(), review.id, notes), "Notes saved.");
  }

  const toggle = (finding: ReviewFinding, important: boolean) =>
    run(() => setFindingImportant(getRepositories(), finding, important));

  return (
    <div className="animate-in space-y-6">
      <Link href="/reviews" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Reviews
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          <p className="mt-1 text-sm text-muted">
            {review.periodStart} – {review.periodEnd} · {review.tradeCount} closed trade{review.tradeCount === 1 ? "" : "s"} ·{" "}
            <SignedValue value={review.netPnl}>{formatMoney(review.netPnl, { signed: true })}</SignedValue> ·{" "}
            {review.status === "OPEN" ? "in progress, refreshes automatically" : "complete"} · generated{" "}
            {formatDateTime(review.generatedAt, detail.timezone)}
          </p>
        </div>
        <Button onClick={() => run(() => regenerateReview(getRepositories(), review.id), "Review regenerated from the latest data.")}>
          <RefreshCw aria-hidden className="size-4" />
          Regenerate
        </Button>
      </header>
      <FormStatus status={status} />
      <p className="text-xs text-muted">
        Findings are generated from your journal. Star the ones that matter — they survive regeneration and appear on
        your dashboard.
      </p>

      {SECTION_ORDER.map((section) => {
        const items = findings.filter((f) => f.section === section);
        if (items.length === 0) return null;
        return (
          <details key={section} open className="group rounded-xl border border-border bg-surface shadow-xs">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 select-none focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 text-muted transition group-open:rotate-90" />
              <h2 className="font-semibold">{SECTION_LABELS[section]}</h2>
              <span className="text-xs text-muted">
                {items.length} finding{items.length === 1 ? "" : "s"}
                {items.some((f) => f.important) && ` · ${items.filter((f) => f.important).length} important`}
              </span>
            </summary>
            <ul className="divide-y divide-border border-t border-border px-5">
              {items.map((f) => (
                <FindingItem key={f.id} finding={f} rows={detail.rows} timezone={detail.timezone} onToggleImportant={(v) => toggle(f, v)} />
              ))}
            </ul>
          </details>
        );
      })}

      <Card>
        <h2 className="text-base font-semibold">Your notes</h2>
        <p className="text-xs text-muted">Your reflection on this {review.kind === "WEEKLY" ? "week" : "month"}. Kept with the review.</p>
        <form key={review.updatedAt} onSubmit={onSaveNotes} className="mt-3 space-y-3">
          <Textarea name="notes" aria-label="Review notes" rows={4} defaultValue={review.notes} />
          <Button type="submit" variant="primary">
            Save notes
          </Button>
        </form>
      </Card>
    </div>
  );
}
