"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Lightbulb } from "lucide-react";
import { DivergingBar } from "@/components/charts/diverging-bar";
import { EquityChart } from "@/components/charts/equity-chart";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { breakdown, DIMENSION_LABELS, type BreakdownGroup, type Dimension } from "@/lib/analytics/breakdowns";
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { applyFilter, DEFAULT_FILTER, rangeBounds, type AnalyticsFilter } from "@/lib/analytics/filters";
import { detectPatterns, MIN_PATTERN_GROUP, MIN_PATTERN_TRADES, type Pattern } from "@/lib/analytics/patterns";
import { emotionFrequency, emotionsByContext, ratingsVsOutcome } from "@/lib/analytics/psychology";
import { groupStats, MIN_SAMPLE, type GroupStats } from "@/lib/analytics/stats";
import { drawdown, drawdownSeries, summarizePerformance } from "@/lib/calculations/performance";
import { PSYCHOLOGY_PHASE_LABELS } from "@/lib/domain/defaults";
import { formatMoney, formatPercent, formatR, formatRatio } from "@/lib/format";
import type { JournalRepositories } from "@/lib/repositories";
import { loadAnalyticsDataset, type AnalyticsDataset } from "@/lib/services/analytics";
import { cn } from "@/lib/ui/cn";
import { useJournalQuery } from "@/lib/ui/use-journal";
import { FilterBar } from "./filter-bar";
import { PatternsAICard } from "@/components/ai/patterns-ai-card";
import { SampleSize } from "./group-stats";
import { TradeEvidence } from "./trade-evidence";

export function AnalyticsView() {
  const load = useCallback((repos: JournalRepositories) => loadAnalyticsDataset(repos), []);
  const query = useJournalQuery(load);
  if (query.status === "loading") return <p className="text-sm text-muted">Loading analytics…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Analytics could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  return <Analytics data={query.data} />;
}

function Analytics({ data }: { data: AnalyticsDataset }) {
  const [filter, setFilter] = useState<AnalyticsFilter>(DEFAULT_FILTER);
  const rows = useMemo(() => applyFilter(data.rows, filter, data.today), [data, filter]);
  const { from } = rangeBounds(filter, data.today);

  return (
    <div className="animate-in space-y-6">
      <FilterBar filter={filter} onChange={setFilter} setups={data.setups} sessions={data.sessions} emotions={data.emotions} />
      {data.rows.length === 0 ? (
        <Card>
          <p className="font-medium">No closed trades yet.</p>
          <p className="mt-1 text-sm text-muted">Analytics use closed trades only. Close a trade to see results here.</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="font-medium">No closed trades match these filters.</p>
        </Card>
      ) : (
        <>
          <Kpis rows={rows} startingBalance={data.startingBalance} />
          <Card className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Equity &amp; drawdown</h2>
              <p className="text-xs text-muted">
                Trades in view, in close order, from your starting balance{from ? " (filtered range only)" : ""}.
              </p>
            </div>
            <EquityChart
              points={drawdownSeries(
                data.startingBalance,
                rows.map((r) => ({ netPnl: r.netPnl, closedAt: r.trade.closedAt! })),
              )}
              timezone={data.timezone}
            />
          </Card>
          <Breakdowns rows={rows} timezone={data.timezone} />
          <Psychology rows={rows} data={data} />
          <Patterns rows={rows} timezone={data.timezone} />
          <PatternsAICard timezone={data.timezone} />
        </>
      )}
    </div>
  );
}

// ── KPIs ─────────────────────────────────────────────────────────────────

function Kpis({ rows, startingBalance }: { rows: AnalyticsRow[]; startingBalance: number }) {
  const results = rows.map((r) => ({ netPnl: r.netPnl, closedAt: r.trade.closedAt! }));
  const perf = summarizePerformance(results);
  const stats = groupStats(rows);
  const dd = drawdown(startingBalance, results);
  const tiles: [string, React.ReactNode][] = [
    ["Net P&L", <SignedValue key="n" value={perf.netPnl}>{formatMoney(perf.netPnl, { signed: true })}</SignedValue>],
    ["Win rate", formatPercent(perf.winRate)],
    ["Expectancy", <SignedValue key="e" value={perf.expectancy}>{perf.expectancy === null ? "—" : formatMoney(perf.expectancy, { signed: true })}</SignedValue>],
    ["Profit factor", formatRatio(perf.profitFactor)],
    ["Average win", perf.averageWin === null ? "—" : formatMoney(perf.averageWin)],
    ["Average loss", perf.averageLoss === null ? "—" : formatMoney(perf.averageLoss)],
    ["Average R", <SignedValue key="r" value={stats.averageR}>{formatR(stats.averageR)}</SignedValue>],
    ["Average quality", stats.averageQuality === null ? "—" : Math.round(stats.averageQuality)],
    ["Max drawdown", dd.maxDrawdown ? `−${formatMoney(dd.maxDrawdown)}` : "$0.00"],
  ];
  return (
    <section aria-label="Key statistics" className="space-y-2">
      <SampleSize stats={stats} />
      {stats.smallSample && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <AlertTriangle aria-hidden className="size-3.5" />
          Fewer than {MIN_SAMPLE} trades: treat these numbers as early indications, not conclusions.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── breakdowns ───────────────────────────────────────────────────────────

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as Dimension[];

function Breakdowns({ rows, timezone }: { rows: AnalyticsRow[]; timezone: string }) {
  const [dimension, setDimension] = useState<Dimension>("setup");
  const [open, setOpen] = useState<string | null>(null);
  const groups = breakdown(rows, dimension);
  const maxAbs = Math.max(0, ...groups.map((g) => Math.abs(g.stats.expectancy ?? 0)));
  const multi = dimension === "emotion" || dimension === "condition";

  return (
    <Card className="space-y-4 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-base font-semibold">Breakdown</h2>
          <p className="text-xs text-muted">
            Bars show expectancy (average net P&amp;L per trade).
            {multi && " A trade can appear in more than one group."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Group by</span>
          <Select
            value={dimension}
            onChange={(e) => {
              setDimension(e.target.value as Dimension);
              setOpen(null);
            }}
            className="w-48"
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {DIMENSION_LABELS[d]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {groups.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">No data for this dimension in the trades shown.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">{DIMENSION_LABELS[dimension]}</th>
                <th scope="col" className="px-3 py-2 font-medium">Trades</th>
                <th scope="col" className="px-3 py-2 font-medium">Win rate</th>
                <th scope="col" className="w-48 px-3 py-2 font-medium">Expectancy</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Net P&amp;L</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Avg R</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">PF</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Quality</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Violations</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <BreakdownRow
                  key={g.key}
                  group={g}
                  maxAbs={maxAbs}
                  open={open === g.key}
                  onToggle={() => setOpen((o) => (o === g.key ? null : g.key))}
                  rows={rows}
                  timezone={timezone}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BreakdownRow({
  group: g,
  maxAbs,
  open,
  onToggle,
  rows,
  timezone,
}: {
  group: BreakdownGroup;
  maxAbs: number;
  open: boolean;
  onToggle: () => void;
  rows: AnalyticsRow[];
  timezone: string;
}) {
  const s = g.stats;
  return (
    <>
      <tr className="border-b border-border align-middle">
        <th scope="row" className="px-5 py-2 text-left font-normal">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-left capitalize hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown aria-hidden className={cn("size-3.5 text-muted transition", !open && "-rotate-90")} />
            {g.label}
          </button>
        </th>
        <td className="px-3 py-2 tabular-nums">
          {s.count}
          {s.smallSample && <span className="ml-1 text-xs text-muted" title={`Fewer than ${MIN_SAMPLE} trades`}>·small</span>}
        </td>
        <td className="px-3 py-2 tabular-nums">{formatPercent(s.winRate, 0)}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <DivergingBar value={s.expectancy} maxAbs={maxAbs} className="w-24" />
            <SignedValue value={s.expectancy}>{s.expectancy === null ? "—" : formatMoney(s.expectancy, { signed: true })}</SignedValue>
          </div>
        </td>
        <td className="px-3 py-2 text-right">
          <SignedValue value={s.netPnl}>{formatMoney(s.netPnl, { signed: true })}</SignedValue>
        </td>
        <td className="px-3 py-2 text-right">
          <SignedValue value={s.averageR}>{formatR(s.averageR)}</SignedValue>
        </td>
        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatRatio(s.profitFactor)}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums">{s.averageQuality === null ? "—" : Math.round(s.averageQuality)}</td>
        <td className="px-5 py-2 text-right tabular-nums">{formatPercent(g.violationRate, 0)}</td>
      </tr>
      {open && (
        <tr className="border-b border-border bg-surface-muted/40">
          <td colSpan={9} className="px-5 py-3">
            <TradeEvidence rows={rows.filter((r) => g.tradeIds.includes(r.trade.id))} timezone={timezone} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── psychology ───────────────────────────────────────────────────────────

type ContextKey = "setup" | "session" | "condition";

function Psychology({ rows, data }: { rows: AnalyticsRow[]; data: AnalyticsDataset }) {
  const [context, setContext] = useState<ContextKey>("setup");
  const frequency = emotionFrequency(rows, data.psychologyByTrade);
  const impact = breakdown(rows, "emotion");
  const ratings = ratingsVsOutcome(rows);
  const byContext = emotionsByContext(rows, (r) =>
    context === "setup" ? [r.setupName ?? "No setup"] : context === "session" ? [r.sessionLabel ?? "No session"] : r.conditionTags,
  );
  const withPsych = rows.filter((r) => r.emotions.length > 0).length;

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Psychology</h2>
        <p className="text-xs text-muted">
          {withPsych} of {rows.length} trades in view have emotions recorded. Associations here are correlations, not
          causes.
        </p>
      </div>
      {frequency.length === 0 ? (
        <p className="text-sm text-muted">Record emotions on your trades to see psychology analytics.</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Most common emotions</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">Emotion</th>
                  <th scope="col" className="py-1 text-right font-medium">Before</th>
                  <th scope="col" className="py-1 text-right font-medium">During</th>
                  <th scope="col" className="py-1 text-right font-medium">After</th>
                  <th scope="col" className="py-1 text-right font-medium">Trades</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {frequency.slice(0, 10).map((f) => (
                  <tr key={f.emotion} className="border-t border-border">
                    <td className="py-1">{f.emotion}</td>
                    <td className="py-1 text-right">{f.byPhase.BEFORE}</td>
                    <td className="py-1 text-right">{f.byPhase.DURING}</td>
                    <td className="py-1 text-right">{f.byPhase.AFTER}</td>
                    <td className="py-1 text-right">
                      {f.trades} <span className="text-xs text-muted">({formatPercent(f.share, 0)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-medium">Emotions vs P&amp;L, quality and rules</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">Emotion</th>
                  <th scope="col" className="py-1 text-right font-medium">n</th>
                  <th scope="col" className="py-1 text-right font-medium">Expectancy</th>
                  <th scope="col" className="py-1 text-right font-medium">Quality</th>
                  <th scope="col" className="py-1 text-right font-medium">Violations</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {impact.slice(0, 10).map((g) => (
                  <tr key={g.key} className="border-t border-border">
                    <td className="py-1">{g.label}</td>
                    <td className="py-1 text-right">
                      {g.stats.count}
                      {g.stats.smallSample && <span className="text-xs text-muted">·small</span>}
                    </td>
                    <td className="py-1 text-right">
                      <SignedValue value={g.stats.expectancy}>
                        {g.stats.expectancy === null ? "—" : formatMoney(g.stats.expectancy, { signed: true })}
                      </SignedValue>
                    </td>
                    <td className="py-1 text-right font-mono">{g.stats.averageQuality === null ? "—" : Math.round(g.stats.averageQuality)}</td>
                    <td className="py-1 text-right">{formatPercent(g.violationRate, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ratings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Ratings on winning vs losing trades</h3>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1 font-medium">Rating</th>
                    <th scope="col" className="py-1 text-right font-medium">Winners</th>
                    <th scope="col" className="py-1 text-right font-medium">Losers</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {ratings.map((r) => (
                    <tr key={`${r.phase}${r.rating}`} className="border-t border-border">
                      <td className="py-1">
                        {r.rating} <span className="text-xs text-muted">· {PSYCHOLOGY_PHASE_LABELS[r.phase].toLowerCase()}</span>
                        {r.smallSample && <span className="text-xs text-muted"> ·small</span>}
                      </td>
                      <td className="py-1 text-right">
                        {r.winners.average === null ? "—" : r.winners.average.toFixed(1)} <span className="text-xs text-muted">n={r.winners.count}</span>
                      </td>
                      <td className="py-1 text-right">
                        {r.losers.average === null ? "—" : r.losers.average.toFixed(1)} <span className="text-xs text-muted">n={r.losers.count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Emotions by</h3>
              <Select value={context} onChange={(e) => setContext(e.target.value as ContextKey)} className="h-8 w-40 py-1" aria-label="Emotions by">
                <option value="setup">Setup</option>
                <option value="session">Session</option>
                <option value="condition">Market conditions</option>
              </Select>
            </div>
            {byContext.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No data.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {byContext.slice(0, 8).map((c) => (
                  <li key={c.context} className="flex flex-wrap justify-between gap-2 border-t border-border pt-1.5">
                    <span className="capitalize">
                      {c.context} <span className="text-xs text-muted">n={c.trades}</span>
                    </span>
                    <span className="text-muted">{c.top.map((t) => `${t.emotion} ${formatPercent(t.share, 0)}`).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── patterns ─────────────────────────────────────────────────────────────

function Patterns({ rows, timezone }: { rows: AnalyticsRow[]; timezone: string }) {
  const patterns = useMemo(() => detectPatterns(rows), [rows]);
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Lightbulb aria-hidden className="size-4 text-accent" />
          Potential patterns
        </h2>
        <p className="text-xs text-muted">
          Differences between a group of trades and all your other trades that are unlikely to be random noise. These
          are correlations in your own history — not proof of cause. Check the supporting trades.
        </p>
      </div>
      {rows.length < MIN_PATTERN_TRADES ? (
        <p className="text-sm text-muted">
          Pattern detection starts at {MIN_PATTERN_TRADES} closed trades in view ({rows.length} now), with at least{" "}
          {MIN_PATTERN_GROUP} trades on each side of a comparison.
        </p>
      ) : patterns.length === 0 ? (
        <p className="text-sm text-muted">No clear patterns in the trades shown. That&apos;s a valid result too.</p>
      ) : (
        <ul className="space-y-3">
          {patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} rows={rows} timezone={timezone} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatsLine({ label, s }: { label: string; s: GroupStats }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm">
        n={s.count} · win {formatPercent(s.winRate, 0)} ·{" "}
        <SignedValue value={s.expectancy}>{s.expectancy === null ? "—" : formatMoney(s.expectancy, { signed: true })}</SignedValue>/trade
        · quality {s.averageQuality === null ? "—" : Math.round(s.averageQuality)}
      </p>
    </div>
  );
}

function PatternCard({ pattern: p, rows, timezone }: { pattern: Pattern; rows: AnalyticsRow[]; timezone: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("rounded-lg border p-4", p.direction === "WORSE" ? "border-chart-loss/40" : "border-chart-gain/40")}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {DIMENSION_LABELS[p.dimension]} · {p.direction === "WORSE" ? "worse than usual" : "better than usual"} · correlation, not
        causation
      </p>
      <p className="mt-1 font-medium">{p.statement}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <StatsLine label={p.groupLabel} s={p.group} />
        <StatsLine label="All other trades" s={p.rest} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {p.metric === "EXPECTANCY" ? "Welch t" : "Two-proportion z"} = {p.statistic.toFixed(2)} (threshold ±2).
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {open ? "Hide" : "Show"} the {p.tradeIds.length} supporting trades
      </button>
      {open && (
        <div className="mt-2">
          <TradeEvidence rows={rows.filter((r) => p.tradeIds.includes(r.trade.id))} timezone={timezone} />
        </div>
      )}
    </li>
  );
}
