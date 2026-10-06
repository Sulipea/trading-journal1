/** Calendar of daily P&L (spec §19). Pure. */
import { roundMoney } from "@/lib/calculations/money";
import type { EntityId } from "@/lib/domain/types";
import type { AnalyticsRow } from "./dataset";

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  netPnl: number;
  tradeCount: number;
  /** −1 … 1: this day's P&L relative to the month's largest absolute day. 0 with no trades. */
  intensity: number;
  tradeIds: EntityId[];
}

export interface CalendarMonth {
  year: number;
  /** 1–12 */
  month: number;
  /** Weeks of 7 days, Monday first. */
  weeks: CalendarDay[][];
  netPnl: number;
  tradeCount: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Daily P&L for a month, from closed trades on the day they closed. */
export function calendarMonth(rows: readonly AnalyticsRow[], year: number, month: number): CalendarMonth {
  const byDay = new Map<string, AnalyticsRow[]>();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);

  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // back to Monday
  const last = new Date(Date.UTC(year, month, 0));

  const days: CalendarDay[] = [];
  for (const d = new Date(start); d <= last || days.length % 7 !== 0; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    const dayRows = byDay.get(date) ?? [];
    days.push({
      date,
      inMonth: d.getUTCMonth() === month - 1,
      netPnl: roundMoney(dayRows.reduce((s, r) => s + r.netPnl, 0)),
      tradeCount: dayRows.length,
      intensity: 0,
      tradeIds: dayRows.map((r) => r.trade.id),
    });
  }

  const inMonth = days.filter((d) => d.inMonth && d.tradeCount > 0);
  const maxAbs = Math.max(0, ...inMonth.map((d) => Math.abs(d.netPnl)));
  for (const d of days) d.intensity = d.inMonth && maxAbs > 0 ? d.netPnl / maxAbs : 0;

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return {
    year,
    month,
    weeks,
    netPnl: roundMoney(inMonth.reduce((s, d) => s + d.netPnl, 0)),
    tradeCount: inMonth.reduce((s, d) => s + d.tradeCount, 0),
    tradingDays: inMonth.length,
    winningDays: inMonth.filter((d) => d.netPnl > 0).length,
    losingDays: inMonth.filter((d) => d.netPnl < 0).length,
  };
}
