import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { computeTradeQuality } from "@/lib/calculations/quality";
import { newId } from "@/lib/domain/ids";
import type { RuleCheck, Trade } from "@/lib/domain/types";
import { makeTrade } from "@/lib/test/fixtures";
import { generateReviewFindings } from "./generate";
import { monthOf, periodLabel, periodsForDays, previousPeriod, weekOf } from "./periods";
import { buildTradeReview, compareTrades, findSimilarTrades } from "./trade-review";

const T = "2026-10-06T12:00:00.000Z";
const quality = (executionRating: number | null, netPnl: number | null = null) =>
  computeTradeQuality({
    checks: [],
    overrideCount: 0,
    executionRating,
    plannedStop: 4995,
    plannedRisk: 250,
    actualRisk: 250,
    plannedContracts: 1,
    maxOpenQuantity: 1,
    rMultiple: null,
    netPnl,
  });

function row(netPnl: number, overrides: Partial<AnalyticsRow> = {}, trade: Partial<Trade> = {}): AnalyticsRow {
  return {
    trade: makeTrade({ status: "CLOSED", closedAt: T, ...trade }),
    netPnl,
    rMultiple: null,
    quality: quality(4, netPnl),
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

describe("periods", () => {
  it("computes Monday-start weeks and calendar months", () => {
    expect(weekOf("2026-10-08")).toEqual({ kind: "WEEKLY", start: "2026-10-05", end: "2026-10-11" });
    expect(weekOf("2026-10-05").start).toBe("2026-10-05");
    expect(monthOf("2026-02-14")).toEqual({ kind: "MONTHLY", start: "2026-02-01", end: "2026-02-28" });
    expect(previousPeriod(weekOf("2026-10-08")).start).toBe("2026-09-28");
    expect(previousPeriod(monthOf("2026-01-10")).start).toBe("2025-12-01");
    expect(periodLabel(weekOf("2026-10-08"))).toBe("Week of Oct 5, 2026");
    expect(periodLabel(monthOf("2026-10-08"))).toBe("October 2026");
  });

  it("lists every week and month containing trade days", () => {
    const periods = periodsForDays(["2026-09-30", "2026-10-02", "2026-10-06"]);
    expect(periods.map((p) => `${p.kind} ${p.start}`)).toEqual([
      "WEEKLY 2026-10-05",
      "MONTHLY 2026-10-01",
      "WEEKLY 2026-09-28",
      "MONTHLY 2026-09-01",
    ]);
  });
});

describe("generateReviewFindings", () => {
  it("covers every section with stable keys and evidence", () => {
    const ruleId = newId();
    const loser = row(-300, { ruleChecks: 1, violations: 1, ruleAdherence: "VIOLATED", emotions: ["FOMO"], forecastAdherence: "UNPLANNED" });
    const loser2 = row(-100, { emotions: ["FOMO"], forecastAdherence: "NO" });
    const winner = row(500, { ruleChecks: 1, ruleAdherence: "CLEAN", emotions: ["Calm"], forecastAdherence: "YES" });
    const check: RuleCheck = {
      id: newId(),
      createdAt: T,
      updatedAt: T,
      tradeId: loser.trade.id,
      ruleId,
      ruleName: "No chasing",
      severity: "HIGH",
      status: "VIOLATED",
      acknowledged: true,
      reason: "FOMO",
    };
    const findings = generateReviewFindings({
      kind: "WEEKLY",
      rows: [loser, loser2, winner],
      previousRows: [row(50)],
      checks: [check],
      forecasts: [],
    });
    const byKey = new Map(findings.map((f) => [f.key, f]));

    expect(byKey.get("perf.summary")).toMatchObject({ kind: "OBSERVATION", title: "+$100.00 net over 3 closed trades" });
    expect(byKey.get("perf.summary")!.detail).toContain("Previous week: +$50.00 over 1 trade.");
    expect(byKey.get("perf.worst")!.tradeIds).toEqual([loser.trade.id]);
    expect(byKey.get(`rules.rule:${ruleId}`)).toMatchObject({ title: '"No chasing" broken 1 time', tradeIds: [loser.trade.id] });
    expect(byKey.get(`rules.q:${ruleId}`)!.kind).toBe("QUESTION");
    expect(byKey.get("psych.emotion:fomo")!.title).toBe("Trades where you felt FOMO averaged -$200.00");
    expect(byKey.get("forecast.none")).toBeDefined();
    expect(byKey.get("exec.adherence")!.title).toBe("1 followed the forecast, 2 deviated, 0 not linked");
    expect(new Set(findings.map((f) => f.section))).toEqual(
      new Set(["PERFORMANCE", "RULES", "PSYCHOLOGY", "FORECAST", "EXECUTION", "SETUPS"]),
    );
    // Regenerating the same data yields the same keys, so important flags can follow them.
    const again = generateReviewFindings({ kind: "WEEKLY", rows: [loser, loser2, winner], previousRows: [row(50)], checks: [check], forecasts: [] });
    expect(again.map((f) => f.key)).toEqual(findings.map((f) => f.key));
  });
});

describe("trade review", () => {
  it("scores similarity on setup, conditions, forecast, psychology and rules", () => {
    const setupId = newId();
    const a = row(100, { setupName: "ORB", conditionTags: ["trending"], emotions: ["Calm"], ruleAdherence: "CLEAN", forecastAdherence: "YES" }, { setupId });
    const b = row(-50, { setupName: "ORB", conditionTags: ["trending"], emotions: ["Calm"], ruleAdherence: "CLEAN", forecastAdherence: "YES" }, { setupId });
    const c = row(20, {}, { direction: "SHORT", root: "NQ", symbol: "NQZ6" });

    const ab = compareTrades(a, b);
    expect(ab.score).toBe(3 + 1 + 1 + 1 + 1 + 1 + 1);
    expect(ab.similarities).toEqual(expect.arrayContaining(["Same setup (ORB)", "Both in trending conditions", "Both felt Calm", "Both followed every rule"]));
    expect(findSimilarTrades(a, [a, b, c]).map((s) => s.row.trade.id)).toEqual([b.trade.id]);
  });

  it("builds every section, with questions driven by the data", () => {
    const r = row(250, {
      ruleChecks: 1,
      violations: 1,
      ruleAdherence: "VIOLATED",
      forecastAdherence: "PARTIAL",
      quality: { ...quality(1, 250), processOutcome: "POOR_PROCESS_WIN" },
    });
    const review = buildTradeReview({
      row: r,
      checks: [
        { id: newId(), createdAt: T, updatedAt: T, tradeId: r.trade.id, ruleId: newId(), ruleName: "Wait for close", severity: "MEDIUM", status: "VIOLATED", acknowledged: true, reason: "" },
      ],
      psychology: [],
      scenarioTitle: "Gap fill",
      matchesBiasAtEntry: false,
      history: [],
    });
    expect(review.sections.map((s) => s.key)).toEqual(["summary", "rules", "forecast", "psychology", "execution", "quality", "similar", "questions"]);
    const text = (key: string) => review.sections.find((s) => s.key === key)!.items.map((i) => i.text).join(" | ");
    expect(text("rules")).toContain('Broke "Wait for close" (medium)');
    expect(text("forecast")).toContain('Scenario "Gap fill": partially followed (deviation).');
    expect(text("forecast")).toContain("against the forecast bias");
    expect(text("questions")).toContain('What made you break "Wait for close"');
    expect(text("questions")).toContain("Would you take this trade again");
    expect(review.sections.find((s) => s.key === "questions")!.items.every((i) => i.kind === "QUESTION")).toBe(true);
  });
});
