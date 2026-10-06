/** Reminders (spec §30): which are due right now. Pure. */
import type { Reminder } from "./types";

export interface ZonedNow {
  /** YYYY-MM-DD in the journal timezone. */
  day: string;
  /** Minutes since midnight. */
  minutes: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function zonedNow(date: Date, timezone: string): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * Timed reminders that are due: enabled, scheduled for today's weekday,
 * their time has passed, and not yet dismissed today.
 */
export function dueReminders(
  reminders: readonly Reminder[],
  now: ZonedNow,
  dismissed: Readonly<Record<string, string>>,
): Reminder[] {
  return reminders.filter(
    (r) =>
      r.enabled &&
      r.time !== null &&
      r.weekdays.includes(now.weekday) &&
      timeToMinutes(r.time) <= now.minutes &&
      dismissed[r.id] !== now.day,
  );
}

/** Reminders shown when opening a new trade. */
export function newTradeReminders(reminders: readonly Reminder[]): Reminder[] {
  return reminders.filter((r) => r.enabled && r.kind === "NEW_TRADE");
}
