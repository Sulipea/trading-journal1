/** Review periods: Monday-start weeks and calendar months, as inclusive trading dates. */
import type { ReviewKind } from "@/lib/domain/types";

export interface Period {
  kind: ReviewKind;
  start: string;
  end: string;
}

function shift(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekOf(day: string): Period {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shift(day, -weekday);
  return { kind: "WEEKLY", start, end: shift(start, 6) };
}

export function monthOf(day: string): Period {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { kind: "MONTHLY", start: `${day.slice(0, 7)}-01`, end };
}

export function periodOf(kind: ReviewKind, day: string): Period {
  return kind === "WEEKLY" ? weekOf(day) : monthOf(day);
}

/** The period immediately before this one. */
export function previousPeriod(period: Period): Period {
  return periodOf(period.kind, shift(period.start, -1));
}

/** Every week and month that contains at least one of `days`, newest first. */
export function periodsForDays(days: Iterable<string>): Period[] {
  const map = new Map<string, Period>();
  for (const day of days) {
    for (const p of [weekOf(day), monthOf(day)]) map.set(`${p.kind}|${p.start}`, p);
  }
  return [...map.values()].sort((a, b) => b.start.localeCompare(a.start) || a.kind.localeCompare(b.kind));
}

export function inPeriod(day: string, period: Pick<Period, "start" | "end">): boolean {
  return day >= period.start && day <= period.end;
}

/** "Week of Oct 5, 2026" / "October 2026". */
export function periodLabel(period: Pick<Period, "kind" | "start">): string {
  const date = new Date(`${period.start}T00:00:00Z`);
  if (period.kind === "MONTHLY") {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  return `Week of ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)}`;
}
