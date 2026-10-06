import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatMoney,
  formatR,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "./format";

describe("format", () => {
  it("signs money and R so meaning never depends on colour", () => {
    expect(formatMoney(1234.5, { signed: true })).toBe("+$1,234.50");
    expect(formatMoney(-20, { signed: true })).toBe("-$20.00");
    expect(formatR(1.5)).toBe("+1.50R");
    expect(formatR(-0.5)).toBe("-0.50R");
  });

  it("formats durations", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(12 * 60_000 + 30_000)).toBe("12m 30s");
    expect(formatDuration(65 * 60_000)).toBe("1h 05m");
    expect(formatDuration(null)).toBe("—");
  });

  it("round-trips datetime-local values", () => {
    const iso = "2026-10-06T14:30:15.000Z";
    expect(fromDateTimeLocal(toDateTimeLocal(iso))).toBe(iso);
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("nonsense")).toBeNull();
  });
});
