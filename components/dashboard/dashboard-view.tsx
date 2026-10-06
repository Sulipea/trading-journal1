"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { SignedValue } from "@/components/trades/badges";
import { applyFilter, DEFAULT_FILTER, type AnalyticsFilter } from "@/lib/analytics/filters";
import { groupStats, type GroupStats } from "@/lib/analytics/stats";
import { equityCurve } from "@/lib/calculations/performance";
import { formatMoney, formatPercent, formatRatio } from "@/lib/format";
import { loadAnalyticsDataset, type AnalyticsDataset } from "@/lib/services/analytics";
import { getRepositories } from "@/lib/repositories";
import { buildDashboardSummary, type DashboardSummary } from "@/lib/services/dashboard";
import { cn } from "@/lib/ui/cn";
import { Card, CardTitle } from "@/components/ui/card";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: DashboardSummary; startingBalance: number; snapshot: Snapshot };

interface Snapshot {
  periods: { label: string; stats: GroupStats }[];
  equity: number[];
}

function buildSnapshot(data: AnalyticsDataset): Snapshot {
  const period = (label: string, range: AnalyticsFilter["range"]) => ({
    label,
    stats: groupStats(applyFilter(data.rows, { ...DEFAULT_FILTER, range }, data.today)),
  });
  return {
    periods: [period("This week", "WEEK"), period("This month", "MONTH"), period("All time", "ALL")],
    equity: equityCurve(
      data.startingBalance,
      data.rows.map((r) => ({ netPnl: r.netPnl, closedAt: r.trade.closedAt! })),
    ).map((p) => p.equity),
  };
}

async function loadDashboard(): Promise<Extract<LoadState, { status: "ready" }>> {
  const repos = getRepositories();
  const [account, app, trades] = await Promise.all([
    repos.settings.getAccount(),
    repos.settings.getApp(),
    repos.trades.list(),
  ]);
  const [eventsByTrade, dataset] = await Promise.all([
    repos.tradeEvents.listForTrades(trades.map((t) => t.id)),
    loadAnalyticsDataset(repos),
  ]);
  const summary = buildDashboardSummary({
    startingBalance: account.startingBalance,
    trades,
    eventsByTrade,
    now: new Date(),
    timezone: app.timezone,
  });
  return { status: "ready", summary, startingBalance: account.startingBalance, snapshot: buildSnapshot(dataset) };
}

export function DashboardView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadDashboard().then(
      (ready) => !cancelled && setState(ready),
      (error: unknown) =>
        !cancelled &&
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not open the local journal.",
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">The local journal could not be opened.</p>
        <p className="mt-1 text-sm text-muted">{state.message}</p>
      </Card>
    );
  }

  const ready = state.status === "ready" ? state : null;
  const s = ready?.summary;

  return (
    <div className="animate-in space-y-6" aria-busy={!ready}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today's P&L" value={s && formatMoney(s.todayNetPnl, { signed: true })} tone={s?.todayNetPnl} />
        <Stat
          label="Today's trades"
          value={s && String(s.todayTradeCount)}
          detail={s && `${s.openTradeCount} open`}
        />
        <Stat
          label="Current equity"
          value={s && formatMoney(s.drawdown.currentEquity)}
          detail={ready && ready.startingBalance === 0 ? "Starting balance not set" : undefined}
        />
        <Stat
          label="Current drawdown"
          value={s && formatMoney(s.drawdown.currentDrawdown)}
          detail={s && `Max ${formatMoney(s.drawdown.maxDrawdown)}`}
        />
      </div>

      {ready && ready.snapshot.periods[2]!.stats.count > 0 && <SnapshotCard snapshot={ready.snapshot} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Key statistics</CardTitle>
          <p className="mt-1 text-xs text-muted">
            {s ? `Based on ${s.performance.tradeCount} closed trade${s.performance.tradeCount === 1 ? "" : "s"}` : "Loading…"}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Metric label="Win rate" value={s && formatPercent(s.performance.winRate)} />
            <Metric label="Profit factor" value={s && formatRatio(s.performance.profitFactor)} />
            <Metric
              label="Expectancy"
              value={s && (s.performance.expectancy === null ? "—" : formatMoney(s.performance.expectancy, { signed: true }))}
            />
            <Metric
              label="Average win"
              value={s && (s.performance.averageWin === null ? "—" : formatMoney(s.performance.averageWin))}
            />
            <Metric
              label="Average loss"
              value={s && (s.performance.averageLoss === null ? "—" : formatMoney(s.performance.averageLoss))}
            />
            <Metric label="Net P&L" value={s && formatMoney(s.performance.netPnl, { signed: true })} />
          </dl>
        </Card>

        <Card>
          <CardTitle>Recent review findings</CardTitle>
          <p className="mt-4 text-sm text-muted">
            Findings from weekly and monthly reviews will appear here once reviews are available.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | undefined;
  detail?: string | undefined;
  /** Colours the value by sign; the sign is also shown in the text. */
  tone?: number | undefined;
}) {
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tabular-nums",
          tone !== undefined && tone > 0 && "text-positive",
          tone !== undefined && tone < 0 && "text-negative",
        )}
      >
        {value ?? <Skeleton />}
      </p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-medium tabular-nums">{value ?? <Skeleton />}</dd>
    </div>
  );
}

function Skeleton() {
  return <span aria-hidden className="inline-block h-[1em] w-20 animate-pulse rounded bg-surface-muted" />;
}

function SnapshotCard({ snapshot }: { snapshot: Snapshot }) {
  return (
    <Card className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle>Performance snapshot</CardTitle>
          <Link href="/analytics" className="text-xs text-accent hover:underline">
            Open analytics
          </Link>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-4">
          {snapshot.periods.map(({ label, stats }) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 font-mono text-base font-semibold">
                <SignedValue value={stats.netPnl}>{formatMoney(stats.netPnl, { signed: true })}</SignedValue>
              </dd>
              <dd className="text-xs text-muted">
                {stats.count} trade{stats.count === 1 ? "" : "s"} · win {formatPercent(stats.winRate, 0)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="text-xs text-muted">Equity, all closed trades</p>
        <Sparkline values={snapshot.equity} height={56} />
      </div>
    </Card>
  );
}
