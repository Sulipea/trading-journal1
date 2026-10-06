"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { KindBadge } from "@/components/reviews/finding-item";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { JournalRepositories } from "@/lib/repositories";
import { loadTradeReview } from "@/lib/services/reviews";
import { useJournalQuery } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";

/** The automatic post-close review of this trade (deterministic; an AI review can sit beside it later). */
export function TradeReviewCard() {
  const { ws } = useWorkspace();
  if (ws.trade.status !== "CLOSED" || ws.trade.deletedAt !== null) return null;
  return <Review key={ws.trade.updatedAt} tradeId={ws.trade.id} timezone={ws.settings.timezone} />;
}

function Review({ tradeId, timezone }: { tradeId: string; timezone: string }) {
  const load = useCallback((repos: JournalRepositories) => loadTradeReview(repos, tradeId), [tradeId]);
  const query = useJournalQuery(load);
  const [showSimilar, setShowSimilar] = useState(false);
  if (query.status !== "ready" || !query.data) return null;
  const review = query.data;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Trade review</h2>
        <p className="text-xs text-muted">Generated from this trade&apos;s data. Every statement is an observation or a question.</p>
      </div>
      <div className="space-y-2">
        {review.sections.map((section) => (
          <details key={section.key} open={section.key === "summary" || section.key === "questions"} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-3.5 text-muted transition group-open:rotate-90" />
              {section.title}
            </summary>
            <ul className="mt-1 space-y-1.5 pl-6">
              {section.items.map((item, i) => (
                <li key={i} className="text-sm">
                  <KindBadge kind={item.kind} />
                  <p className={item.kind === "QUESTION" ? "mt-0.5 italic" : "mt-0.5"}>{item.text}</p>
                </li>
              ))}
            </ul>
            {section.key === "similar" && review.similar.length > 0 && (
              <div className="mt-2 pl-6">
                <button
                  type="button"
                  aria-expanded={showSimilar}
                  onClick={() => setShowSimilar((s) => !s)}
                  className="text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {showSimilar ? "Hide" : "Compare"} similar trades
                </button>
                {showSimilar && (
                  <ul className="mt-2 space-y-2">
                    {review.similar.map((s) => (
                      <li key={s.row.trade.id} className="rounded-lg border border-border p-2.5 text-xs">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <Link href={`/trades/${s.row.trade.id}`} className="font-mono font-medium hover:underline">
                            {s.row.trade.symbol}
                          </Link>
                          <span className="text-muted">{s.row.trade.closedAt && formatDateTime(s.row.trade.closedAt, timezone)}</span>
                          <span className="ml-auto">
                            <SignedValue value={s.row.netPnl}>{formatMoney(s.row.netPnl, { signed: true })}</SignedValue>
                          </span>
                        </p>
                        <p className="mt-1">
                          <span className="text-muted">Alike:</span> {s.similarities.join(" · ") || "—"}
                        </p>
                        {s.differences.length > 0 && (
                          <p>
                            <span className="text-muted">Different:</span> {s.differences.join(" · ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </details>
        ))}
      </div>
    </Card>
  );
}
