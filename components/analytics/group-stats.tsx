import { AlertTriangle } from "lucide-react";
import type { GroupStats } from "@/lib/analytics/stats";
import { MIN_SAMPLE } from "@/lib/analytics/stats";
import { formatMoney, formatPercent, formatR, formatRatio } from "@/lib/format";
import { SignedValue } from "@/components/trades/badges";
import { cn } from "@/lib/ui/cn";

/** "n trades" with a small-sample warning, so coincidences aren't read as facts. */
export function SampleSize({ stats, className }: { stats: Pick<GroupStats, "count" | "smallSample">; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted", className)}>
      {stats.count} closed trade{stats.count === 1 ? "" : "s"}
      {stats.smallSample && stats.count > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px]"
          title={`Fewer than ${MIN_SAMPLE} trades — treat results as a possible pattern, not a fact.`}
        >
          <AlertTriangle aria-hidden className="size-3" />
          small sample
        </span>
      )}
    </span>
  );
}

/** Compact stat grid for a group of trades. */
export function GroupStatsGrid({ stats, className }: { stats: GroupStats; className?: string }) {
  const items: [string, React.ReactNode][] = [
    ["Win rate", formatPercent(stats.winRate)],
    [
      "Net P&L",
      <SignedValue key="net" value={stats.netPnl}>
        {formatMoney(stats.netPnl, { signed: true })}
      </SignedValue>,
    ],
    [
      "Expectancy",
      <SignedValue key="exp" value={stats.expectancy}>
        {stats.expectancy === null ? "—" : formatMoney(stats.expectancy, { signed: true })}
      </SignedValue>,
    ],
    [
      "Avg R",
      <SignedValue key="r" value={stats.averageR}>
        {formatR(stats.averageR)}
      </SignedValue>,
    ],
    ["Profit factor", formatRatio(stats.profitFactor)],
    ["Avg quality", stats.averageQuality === null ? "—" : Math.round(stats.averageQuality)],
  ];
  return (
    <dl className={cn("grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6", className)}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="font-mono text-sm font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
