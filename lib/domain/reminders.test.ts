import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDERS } from "./defaults";
import { dueReminders, newTradeReminders, zonedNow } from "./reminders";

describe("reminders", () => {
  it("reads the time in the journal timezone", () => {
    // 13:45 UTC on Tuesday is 09:45 in New York.
    expect(zonedNow(new Date("2026-10-06T13:45:00.000Z"), "America/New_York")).toEqual({
      day: "2026-10-06",
      minutes: 9 * 60 + 45,
      weekday: 1,
    });
  });

  it("is due after its time on scheduled weekdays, until dismissed for the day", () => {
    const start = DEFAULT_REMINDERS[0]!; // 08:30 Mon–Fri
    const tuesday = (minutes: number) => ({ day: "2026-10-06", minutes, weekday: 1 });
    expect(dueReminders([start], tuesday(8 * 60 + 29), {})).toEqual([]);
    expect(dueReminders([start], tuesday(8 * 60 + 30), {})).toEqual([start]);
    expect(dueReminders([start], tuesday(12 * 60), { [start.id]: "2026-10-06" })).toEqual([]);
    expect(dueReminders([start], tuesday(12 * 60), { [start.id]: "2026-10-05" })).toEqual([start]); // dismissed yesterday
    expect(dueReminders([start], { day: "2026-10-10", minutes: 12 * 60, weekday: 5 }, {})).toEqual([]); // Saturday
    expect(dueReminders([{ ...start, enabled: false }], tuesday(12 * 60), {})).toEqual([]);
  });

  it("keeps new-trade reminders out of the timed list", () => {
    const now = { day: "2026-10-06", minutes: 23 * 60, weekday: 1 };
    expect(dueReminders(DEFAULT_REMINDERS, now, {}).map((r) => r.kind)).toEqual(["START_OF_DAY", "END_OF_DAY"]);
    expect(newTradeReminders(DEFAULT_REMINDERS).map((r) => r.kind)).toEqual(["NEW_TRADE"]);
  });
});
