import Link from "next/link";
import { QualityBadge } from "@/components/rules/badges";
import { DirectionBadge, SignedValue } from "@/components/trades/badges";
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { formatDateTime, formatMoney, formatR } from "@/lib/format";

/** The trades behind a number, so any statistic can be checked trade by trade. */
export function TradeEvidence({ rows, timezone }: { rows: readonly AnalyticsRow[]; timezone: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No trades.</p>;
  const sorted = [...rows].sort((a, b) => (b.trade.closedAt ?? "").localeCompare(a.trade.closedAt ?? ""));
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {sorted.map((r) => (
        <li key={r.trade.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
          <Link href={`/trades/${r.trade.id}`} className="font-mono font-medium hover:underline">
            {r.trade.symbol}
          </Link>
          <DirectionBadge direction={r.trade.direction} />
          <span className="text-xs text-muted">{r.trade.closedAt && formatDateTime(r.trade.closedAt, timezone)}</span>
          {r.setupName && <span className="text-xs text-muted">· {r.setupName}</span>}
          <span className="ml-auto">
            <SignedValue value={r.netPnl}>{formatMoney(r.netPnl, { signed: true })}</SignedValue>
          </span>
          <SignedValue value={r.rMultiple}>{formatR(r.rMultiple)}</SignedValue>
          <QualityBadge quality={r.quality} />
        </li>
      ))}
    </ul>
  );
}
