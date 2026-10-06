import { describe, expect, it } from "vitest";
import { computeTradeQuality } from "@/lib/calculations/quality";
import { emptyForecastContent } from "@/lib/domain/forecast";
import { DEFAULT_SESSIONS } from "@/lib/domain/defaults";
import { newId } from "@/lib/domain/ids";
import type { ForecastRevision, PsychologyEntry, RuleCheck, Trade } from "@/lib/domain/types";
import { makeTrade } from "@/lib/test/fixtures";
import { breakdown } from "./breakdowns";
import { calendarMonth } from "./calendar";
import { buildAnalyticsRows, zonedParts, type AnalyticsRow } from "./dataset";
import { DEFAULT_FILTER, NO_SETUP, applyFilter, rangeBounds } from "./filters";
import { MIN_PATTERN_GROUP, detectPatterns, proportionZ, welchT } from "./patterns";
import { emotionFrequency, emotionsByContext, ratingsVsOutcome } from "./psychology";

const T = "2026-10-06T12:00:00.000Z";
const quality = (executionRating: number | null) =>
  computeTradeQuality({
    checks: [],
    overrideCount: 0,
    executionRating,
    plannedStop: null,
    plannedRisk: null,
    actualRisk: null,
    plannedContracts: 1,
    maxOpenQuantity: null,
    rMultiple: null,
    netPnl: null,
  });

/** An analytics row built directly, for pure-function tests. */
function row(netPnl: number, overrides: Partial<AnalyticsRow> = {}, trade: Partial<Trade> = {}): AnalyticsRow {
  return {
    trade: makeTrade({ status: "CLOSED", closedAt: T, ...trade }),
    netPnl,
    rMultiple: null,
    quality: quality(null),
    day: "2026-10-06",
    hour: 9,
    weekday: 1,
    setupName: null,
    sessionLabel: null,
    emotions: [],
    ratings: {},
    ruleChecks: 0,
    violations: 0,
    ruleAdherence: "UNCHECKED",
    forecastAdherence: "UNLINKED",
    conditionTags: [],
    ...overrides,
  };
}

describe("buildAnalyticsRows", () => {
  it("derives day, hour, weekday, emotions, rule adherence, forecast adherence and conditions", () => {
    const trade = makeTrade({
      status: "CLOSED",
      openedAt: "2026-10-06T13:45:00.000Z", // 09:45 New York, Tuesday
      closedAt: "2026-10-07T03:00:00.000Z", // 23:00 New York on the 6th
      session: "NY_AM",
    });
    const forecastId = newId();
    const revision: ForecastRevision = {
      id: newId(),
      createdAt: T,
      updatedAt: T,
      forecastId,
      number: 0,
      finalizedAt: "2026-10-06T12:00:00.000Z",
      reason: "",
      changes: [],
      content: { ...emptyForecastContent(), conditionTags: ["Trending"] },
      snapshotId: null,
    };
    const psych: PsychologyEntry = {
      id: newId(),
      createdAt: T,
      updatedAt: T,
      tradeId: trade.id,
      phase: "BEFORE",
      emotions: ["Calm", "Focused"],
      ratings: { Focus: 4 },
      text: "",
    };
    const check: RuleCheck = {
      id: newId(),
      createdAt: T,
      updatedAt: T,
      tradeId: trade.id,
      ruleId: newId(),
      ruleName: "No chasing",
      severity: "LOW",
      status: "VIOLATED",
      acknowledged: false,
      reason: "",
    };
    const [r] = buildAnalyticsRows([{ trade, netPnl: 100, rMultiple: 1, quality: quality(4) }], {
      timezone: "America/New_York",
      sessions: DEFAULT_SESSIONS,
      setups: [],
      psychology: [psych],
      checks: [check],
      links: [
        {
          id: newId(),
          createdAt: T,
          updatedAt: T,
          tradeId: trade.id,
          planned: true,
          forecastId,
          scenarioId: newId(),
          revisionIdAtEntry: null,
          adherence: "PARTIAL",
          reason: "x",
        },
      ],
      revisions: [revision],
    });
    expect(r).toMatchObject({
      day: "2026-10-06",
      hour: 9,
      weekday: 1,
      sessionLabel: "New York AM",
      emotions: ["Calm", "Focused"],
      ratings: { BEFORE: { Focus: 4 } },
      ruleAdherence: "VIOLATED",
      violations: 1,
      forecastAdherence: "PARTIAL",
      conditionTags: ["trending"],
    });
  });

  it("reads zoned parts across midnight", () => {
    expect(zonedParts("2026-10-05T23:30:00.000Z", "Europe/Berlin")).toEqual({ day: "2026-10-06", hour: 1, weekday: 1 });
  });
});

describe("filters", () => {
  it("computes range bounds with Monday-start weeks", () => {
    const today = "2026-10-08"; // Thursday
    expect(rangeBounds({ ...DEFAULT_FILTER, range: "TODAY" }, today)).toEqual({ from: today, to: today });
    expect(rangeBounds({ ...DEFAULT_FILTER, range: "WEEK" }, today)).toEqual({ from: "2026-10-05", to: today });
    expect(rangeBounds({ ...DEFAULT_FILTER, range: "MONTH" }, today)).toEqual({ from: "2026-10-01", to: today });
    expect(rangeBounds({ ...DEFAULT_FILTER, range: "YEAR" }, today)).toEqual({ from: "2026-01-01", to: today });
    expect(rangeBounds({ ...DEFAULT_FILTER, range: "ALL" }, today)).toEqual({ from: null, to: null });
  });

  it("filters by every dimension", () => {
    const setupId = newId();
    const rows = [
      row(100, { day: "2026-10-06", emotions: ["Calm"], ruleAdherence: "CLEAN", quality: quality(5) }, { setupId, session: "NY_AM" }),
      row(-50, { day: "2026-09-30", emotions: ["FOMO"], ruleAdherence: "VIOLATED", weekday: 2 }, { direction: "SHORT", root: "NQ", symbol: "NQZ6" }),
    ];
    const today = "2026-10-08";
    const only = (patch: Partial<typeof DEFAULT_FILTER>) => applyFilter(rows, { ...DEFAULT_FILTER, ...patch }, today).map((r) => r.netPnl);
    expect(only({ range: "MONTH" })).toEqual([100]);
    expect(only({ instruments: ["NQ"] })).toEqual([-50]);
    expect(only({ direction: "LONG" })).toEqual([100]);
    expect(only({ setupIds: [setupId] })).toEqual([100]);
    expect(only({ setupIds: [NO_SETUP] })).toEqual([-50]);
    expect(only({ sessions: ["NY_AM"] })).toEqual([100]);
    expect(only({ weekdays: [2] })).toEqual([-50]);
    expect(only({ emotions: ["FOMO"] })).toEqual([-50]);
    expect(only({ ruleAdherence: "CLEAN" })).toEqual([100]);
    expect(only({ grades: ["A"] })).toEqual([100]);
    expect(only({ range: "CUSTOM", from: "2026-09-01", to: "2026-09-30" })).toEqual([-50]);
  });
});

describe("breakdown", () => {
  it("groups with sample sizes, multi-valued emotions, and natural order for hours", () => {
    const rows = [
      row(100, { hour: 14, emotions: ["Calm", "Focused"] }),
      row(-40, { hour: 9, emotions: ["Calm"] }),
      row(20, { hour: 9 }),
    ];
    expect(breakdown(rows, "hour").map((g) => [g.label, g.stats.count])).toEqual([
      ["09:00", 2],
      ["14:00", 1],
    ]);
    const emotions = breakdown(rows, "emotion");
    expect(emotions.map((g) => [g.label, g.stats.count, g.stats.netPnl])).toEqual([
      ["Calm", 2, 60],
      ["Focused", 1, 100],
    ]);
    expect(emotions[0]!.stats.smallSample).toBe(true);
  });

  it("reports the violation rate within each group", () => {
    const rows = [row(10, { ruleChecks: 2, violations: 1 }, { direction: "LONG" }), row(10, { ruleChecks: 1, violations: 0 }, { direction: "LONG" })];
    expect(breakdown(rows, "direction")[0]!.violationRate).toBe(0.5);
  });
});

describe("calendarMonth", () => {
  it("lays out Monday-first weeks with daily P&L and intensity", () => {
    const rows = [row(200, { day: "2026-10-06" }), row(-100, { day: "2026-10-06" }), row(-50, { day: "2026-10-20" })];
    const cal = calendarMonth(rows, 2026, 10);
    expect(cal.weeks[0]![0]!.date).toBe("2026-09-28"); // Oct 1 2026 is a Thursday
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
    const day = cal.weeks.flat().find((d) => d.date === "2026-10-06")!;
    expect(day).toMatchObject({ netPnl: 100, tradeCount: 2, intensity: 1 });
    expect(cal.weeks.flat().find((d) => d.date === "2026-10-20")!.intensity).toBe(-0.5);
    expect(cal).toMatchObject({ netPnl: 50, tradeCount: 3, tradingDays: 2, winningDays: 1, losingDays: 1 });
  });
});

describe("psychology analytics", () => {
  it("counts emotions per phase, compares ratings on wins vs losses, and groups by context", () => {
    const a = row(100, { emotions: ["Calm"], ratings: { BEFORE: { Focus: 5 } }, setupName: "ORB" });
    const b = row(-100, { emotions: ["FOMO", "Calm"], ratings: { BEFORE: { Focus: 2 } }, setupName: "ORB" });
    const entries = new Map([
      [a.trade.id, [{ phase: "BEFORE" as const, emotions: ["Calm"] }]],
      [b.trade.id, [{ phase: "BEFORE" as const, emotions: ["FOMO"] }, { phase: "AFTER" as const, emotions: ["Calm"] }]],
    ]);
    const freq = emotionFrequency([a, b], entries);
    expect(freq[0]).toMatchObject({ emotion: "Calm", trades: 2, share: 1, byPhase: { BEFORE: 1, DURING: 0, AFTER: 1 } });

    expect(ratingsVsOutcome([a, b])[0]).toMatchObject({
      phase: "BEFORE",
      rating: "Focus",
      winners: { count: 1, average: 5 },
      losers: { count: 1, average: 2 },
      smallSample: true,
    });

    const ctx = emotionsByContext([a, b], (r) => (r.setupName ? [r.setupName] : []));
    expect(ctx[0]).toMatchObject({ context: "ORB", trades: 2, top: [{ emotion: "Calm", share: 1 }, { emotion: "FOMO", share: 0.5 }] });
  });
});

describe("pattern detection", () => {
  it("computes test statistics", () => {
    expect(welchT([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(welchT([10, 11, 12], [1, 2, 3])).toBeGreaterThan(2);
    expect(proportionZ(9, 10, 1, 10)).toBeGreaterThan(2);
  });

  it("stays silent without enough data", () => {
    const rows = Array.from({ length: MIN_PATTERN_GROUP * 2 - 1 }, (_, i) => row(i % 2 ? -100 : 100));
    expect(detectPatterns(rows)).toEqual([]);
  });

  it("surfaces a clear difference as a potential pattern with its evidence", () => {
    const fomo = Array.from({ length: 12 }, (_, i) => row(-150 + (i % 3) * 10, { emotions: ["FOMO"] }));
    const calm = Array.from({ length: 20 }, (_, i) => row(80 + (i % 4) * 15, { emotions: ["Calm"] }));
    const patterns = detectPatterns([...fomo, ...calm]);
    const p = patterns.find((x) => x.dimension === "emotion" && x.groupLabel === "FOMO")!;
    expect(p).toMatchObject({ metric: "EXPECTANCY", direction: "WORSE" });
    expect(p.statement).toMatch(/^Potential pattern: trades where you felt "FOMO" averaged -\$/);
    expect(p.tradeIds).toHaveLength(12);
    expect(p.group.count).toBe(12);
    expect(p.rest.count).toBe(20);
  });

  it("ignores noise", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(i % 2 ? 100 : -100, { emotions: [i % 4 < 2 ? "Calm" : "Focused"] }));
    expect(detectPatterns(rows).filter((p) => p.dimension === "emotion")).toEqual([]);
  });
});
