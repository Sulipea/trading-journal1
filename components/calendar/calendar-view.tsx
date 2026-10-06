"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TradeEvidence } from "@/components/analytics/trade-evidence";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/form";
import { calendarMonth, type CalendarDay } from "@/lib/analytics/calendar";
import { formatMoney } from "@/lib/format";
import type { JournalRepositories } from "@/lib/repositories";
import { loadAnalyticsDataset, type AnalyticsDataset } from "@/lib/services/analytics";
import { cn } from "@/lib/ui/cn";
import { useJournalQuery } from "@/lib/ui/use-journal";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView() {
  const load = useCallback((repos: JournalRepositories) => loadAnalyticsDataset(repos), []);
  const query = useJournalQuery(load);
  if (query.status === "loading") return <p className="text-sm text-muted">Loading calendar…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">The calendar could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  return <Calendar data={query.data} />;
}

/** Cell background: the gain/loss hue mixed into the neutral by |intensity| (a light wash at most). */
function cellBackground(day: CalendarDay): string | undefined {
  if (!day.inMonth || day.tradeCount === 0) return undefined;
  const hue = day.netPnl >= 0 ? "var(--chart-gain)" : "var(--chart-loss)";
  const amount = 12 + Math.round(Math.abs(day.intensity) * 40);
  return `color-mix(in oklab, ${hue} ${amount}%, var(--chart-neutral))`;
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function Calendar({ data }: { data: AnalyticsDataset }) {
  const [year0, month0] = data.today.split("-").map(Number) as [number, number];
  const [ym, setYm] = useState({ year: year0, month: month0 });
  const [selected, setSelected] = useState<string | null>(null);
  const cal = useMemo(() => calendarMonth(data.rows, ym.year, ym.month), [data.rows, ym]);
  const selectedDay = cal.weeks.flat().find((d) => d.date === selected) ?? null;

  const shift = (by: number) => {
    setSelected(null);
    setYm(({ year, month }) => {
      const d = new Date(Date.UTC(year, month - 1 + by, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    });
  };

  return (
    <div className="animate-in space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" className="p-2" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden className="size-5" />
        </Button>
        <h2 className="min-w-44 text-center text-lg font-semibold" aria-live="polite">
          {monthLabel(ym.year, ym.month)}
        </h2>
        <Button variant="ghost" className="p-2" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight aria-hidden className="size-5" />
        </Button>
        {(ym.year !== year0 || ym.month !== month0) && (
          <Button
            onClick={() => {
              setSelected(null);
              setYm({ year: year0, month: month0 });
            }}
          >
            This month
          </Button>
        )}
        <dl className="ml-auto flex flex-wrap gap-5 text-sm">
          <div>
            <dt className="text-xs text-muted">Net P&amp;L</dt>
            <dd className="font-mono font-semibold">
              <SignedValue value={cal.netPnl}>{formatMoney(cal.netPnl, { signed: true })}</SignedValue>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Trades</dt>
            <dd className="font-mono font-semibold">{cal.tradeCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Green / red days</dt>
            <dd className="font-mono font-semibold">
              {cal.winningDays} / {cal.losingDays}
              <span className="font-sans text-xs font-normal text-muted"> of {cal.tradingDays}</span>
            </dd>
          </div>
        </dl>
      </div>

      <Card className="p-3">
        <div role="grid" aria-label={`Daily P&L for ${monthLabel(ym.year, ym.month)}`} className="space-y-1">
          <div role="row" className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} role="columnheader" className="px-2 py-1 text-xs font-medium text-muted">
                {d}
              </div>
            ))}
          </div>
          {cal.weeks.map((week) => (
            <div key={week[0]!.date} role="row" className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <div key={day.date} role="gridcell">
                  <button
                    type="button"
                    disabled={!day.inMonth}
                    onClick={() => setSelected((s) => (s === day.date ? null : day.date))}
                    aria-pressed={selected === day.date}
                    aria-label={`${longDate(day.date)}: ${
                      day.tradeCount ? `${formatMoney(day.netPnl, { signed: true })}, ${day.tradeCount} trade${day.tradeCount === 1 ? "" : "s"}` : "no trades"
                    }`}
                    style={{ background: cellBackground(day) }}
                    className={cn(
                      "flex h-20 w-full flex-col items-start justify-between rounded-lg border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-ring sm:h-24",
                      day.inMonth ? "border-border hover:border-muted" : "border-transparent opacity-40",
                      day.inMonth && day.tradeCount === 0 && "bg-surface",
                      selected === day.date && "ring-2 ring-accent",
                      day.date === data.today && "border-accent",
                    )}
                  >
                    <span className={cn("text-xs", day.date === data.today ? "font-semibold text-accent" : "text-muted")}>
                      {Number(day.date.slice(8))}
                    </span>
                    {day.inMonth && day.tradeCount > 0 && (
                      <span>
                        <span className="block font-mono text-sm font-semibold tabular-nums">{formatMoney(day.netPnl, { signed: true })}</span>
                        <span className="block text-[11px] text-muted">
                          {day.tradeCount} trade{day.tradeCount === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 px-1 text-xs text-muted" aria-hidden>
          <span>Bigger loss</span>
          <span
            className="h-2 w-40 rounded-full"
            style={{
              background:
                "linear-gradient(to right, color-mix(in oklab, var(--chart-loss) 52%, var(--chart-neutral)), var(--chart-neutral), color-mix(in oklab, var(--chart-gain) 52%, var(--chart-neutral)))",
            }}
          />
          <span>Bigger gain</span>
          <span className="ml-3">Shading is relative to this month&apos;s biggest day. P&amp;L counts on the day a trade closed.</span>
        </div>
      </Card>

      {selectedDay && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{longDate(selectedDay.date)}</h2>
            <span className="text-sm">
              <SignedValue value={selectedDay.netPnl}>{formatMoney(selectedDay.netPnl, { signed: true })}</SignedValue>
              <span className="text-muted"> · {selectedDay.tradeCount} closed trade{selectedDay.tradeCount === 1 ? "" : "s"}</span>
            </span>
          </div>
          <TradeEvidence rows={data.rows.filter((r) => selectedDay.tradeIds.includes(r.trade.id))} timezone={data.timezone} />
        </Card>
      )}
    </div>
  );
}
