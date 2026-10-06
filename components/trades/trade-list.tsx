"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/form";
import { formatDateTime, formatMoney, formatPrice, formatR } from "@/lib/format";
import type { JournalRepositories } from "@/lib/repositories";
import { listTradeRows } from "@/lib/services/trades";
import { cn } from "@/lib/ui/cn";
import { useJournalQuery } from "@/lib/ui/use-journal";
import { DirectionBadge, SignedValue, StatusBadge } from "./badges";

type Filter = "all" | "open" | "closed";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];
const PAGE_SIZE = 50;

export function TradeList() {
  const load = useCallback(
    async (repos: JournalRepositories) => ({
      rows: await listTradeRows(repos),
      timezone: (await repos.settings.getApp()).timezone,
    }),
    [],
  );
  const query = useJournalQuery(load);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading trades…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Trades could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }

  const { rows, timezone } = query.data;
  const filtered = rows.filter(({ trade }) =>
    filter === "all" ? true : filter === "closed" ? trade.status === "CLOSED" : trade.status !== "CLOSED",
  );
  const visible = filtered.slice(0, limit);

  return (
    <div className="animate-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter trades" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-ring",
                filter === value ? "bg-surface-muted font-medium" : "text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Link href="/trades/trash" className={buttonClass("ghost")}>
          <Trash2 aria-hidden className="size-4" />
          Trash
        </Link>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="font-medium">No trades yet.</p>
          <p className="mt-1 text-sm text-muted">
            Use <Link href="/trades/new" className="text-accent underline-offset-2 hover:underline">New Trade</Link> to log your first one.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Trades, newest first</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Opened</th>
                <th scope="col" className="px-4 py-3 font-medium">Contract</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Avg entry</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Net P&amp;L</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">R</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ trade, metrics }) => {
                const net = metrics.fills?.netPnl ?? null;
                return (
                  <tr key={trade.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDateTime(trade.openedAt, timezone)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/trades/${trade.id}`}
                        className="inline-flex items-center gap-2 font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {trade.symbol}
                        <DirectionBadge direction={trade.direction} />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatPrice(metrics.fills?.averageEntry ?? null)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SignedValue value={net}>{net === null ? "—" : formatMoney(net, { signed: true })}</SignedValue>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SignedValue value={metrics.rMultiple}>{formatR(metrics.rMultiple)}</SignedValue>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {filtered.length > limit && (
        <div className="flex justify-center">
          <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Show more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">
        Net P&amp;L shows realized P&amp;L after fees; open trades show what has been exited so far.
      </p>
    </div>
  );
}
