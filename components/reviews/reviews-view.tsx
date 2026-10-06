"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Star } from "lucide-react";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import type { ReviewKind } from "@/lib/domain/types";
import { formatMoney } from "@/lib/format";
import type { JournalRepositories } from "@/lib/repositories";
import { SECTION_LABELS } from "@/lib/reviews/generate";
import { periodLabel } from "@/lib/reviews/periods";
import { loadReviewsOverview } from "@/lib/services/reviews";
import { cn } from "@/lib/ui/cn";
import { useJournalQuery } from "@/lib/ui/use-journal";
import { KindBadge } from "./finding-item";

type Tab = ReviewKind | "IMPORTANT";
const TABS: { value: Tab; label: string }[] = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "IMPORTANT", label: "Important findings" },
];

export function ReviewsView() {
  const load = useCallback((repos: JournalRepositories) => loadReviewsOverview(repos), []);
  const query = useJournalQuery(load);
  const [tab, setTab] = useState<Tab>("WEEKLY");

  if (query.status === "loading") return <p className="text-sm text-muted">Preparing reviews…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Reviews could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  const { reviews, important } = query.data;
  const list = reviews.filter((r) => r.kind === tab);

  return (
    <div className="animate-in space-y-5">
      <div role="group" aria-label="Review type" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring",
              tab === t.value ? "bg-surface-muted font-medium" : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
            {t.value === "IMPORTANT" && important.length > 0 && ` (${important.length})`}
          </button>
        ))}
      </div>

      {tab === "IMPORTANT" ? (
        important.length === 0 ? (
          <Card>
            <p className="font-medium">No important findings yet.</p>
            <p className="mt-1 text-sm text-muted">Star findings in a review to keep them here. They stay attached to their review.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {important.map(({ finding, review }) => (
              <li key={finding.id}>
                <Card className="py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Star aria-hidden className="size-3.5 fill-accent text-accent" />
                    <Link href={`/reviews/${review.id}`} className="text-accent hover:underline">
                      {periodLabel({ kind: review.kind, start: review.periodStart })}
                    </Link>
                    · {SECTION_LABELS[finding.section]}
                    <KindBadge kind={finding.kind} />
                    {finding.stale && <span>· no longer produced by the data</span>}
                  </div>
                  <p className="mt-1 text-sm font-medium">{finding.title}</p>
                  {finding.detail && <p className="text-sm text-muted">{finding.detail}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : list.length === 0 ? (
        <Card>
          <p className="font-medium">No {tab === "WEEKLY" ? "weekly" : "monthly"} reviews yet.</p>
          <p className="mt-1 text-sm text-muted">Reviews are created automatically for every period with closed trades.</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reviews/${r.id}`}
                className="block rounded-xl border border-border bg-surface p-5 shadow-xs transition hover:border-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{periodLabel({ kind: r.kind, start: r.periodStart })}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      r.status === "OPEN" ? "bg-accent/15 text-accent" : "bg-surface-muted text-muted",
                    )}
                  >
                    {r.status === "OPEN" ? "In progress" : "Complete"}
                  </span>
                </div>
                <p className="mt-2 font-mono text-lg font-semibold">
                  <SignedValue value={r.netPnl}>{formatMoney(r.netPnl, { signed: true })}</SignedValue>
                </p>
                <p className="text-xs text-muted">
                  {r.tradeCount} closed trade{r.tradeCount === 1 ? "" : "s"}
                  {r.notes && " · has your notes"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
