import { describe, expect, it } from "vitest";
import { computeTradeQuality } from "@/lib/calculations/quality";
import { emptyForecastContent } from "@/lib/domain/forecast";
import { newId } from "@/lib/domain/ids";
import type {
  Bias,
  Confidence,
  Forecast,
  ForecastContent,
  ForecastRevision,
  ForecastTradeLink,
  LevelInteraction,
  ScenarioOutcome,
} from "@/lib/domain/types";
import { makeTrade } from "@/lib/test/fixtures";
import {
  executionAgainstForecast,
  forecastAccuracy,
  forecastAnalytics,
  isDeviation,
  levelStats,
  tallyScenarios,
  type ForecastWithRevisions,
} from "./forecast";
import type { TradeResultRow } from "./stats";

const T = "2026-10-06T12:00:00.000Z";

function item(
  biases: Bias[],
  actualBias: Bias | null,
  overrides: Partial<ForecastContent> = {},
  scenarioOutcomes: Record<string, ScenarioOutcome> = {},
): ForecastWithRevisions {
  const forecastId = newId();
  const revisions: ForecastRevision[] = biases.map((bias, number) => ({
    id: newId(),
    createdAt: T,
    updatedAt: T,
    forecastId,
    number,
    finalizedAt: T,
    reason: number ? "changed" : "",
    changes: [],
    content: { ...emptyForecastContent(), ...overrides, bias },
    snapshotId: null,
  }));
  const forecast: Forecast = {
    id: forecastId,
    createdAt: T,
    updatedAt: T,
    date: "2026-10-06",
    status: "FINAL",
    activeRevisionId: revisions.at(-1)!.id,
    reopenedAt: null,
    review:
      actualBias === null && Object.keys(scenarioOutcomes).length === 0
        ? null
        : { actualBias, actualOutcome: "", scenarioOutcomes, notes: "", reviewedAt: T },
  };
  return { forecast, revisions };
}

describe("forecast accuracy", () => {
  it("tallies scenario outcomes, ignoring scenarios that never triggered", () => {
    expect(tallyScenarios(["PLAYED_OUT", "PARTIAL", "INVALIDATED", "NOT_TRIGGERED"]).hitRate).toBe(0.5);
    expect(tallyScenarios(["NOT_TRIGGERED"]).hitRate).toBeNull();
  });

  it("judges original and final bias and whether revising helped", () => {
    const improved = item(["BEARISH", "BULLISH"], "BULLISH");
    const a = forecastAccuracy(improved.forecast, improved.revisions)!;
    expect(a).toMatchObject({ originalBiasCorrect: false, finalBiasCorrect: true, revisionCount: 1, revisionEffect: "IMPROVED" });

    const worsened = item(["BULLISH", "NEUTRAL"], "BULLISH");
    expect(forecastAccuracy(worsened.forecast, worsened.revisions)!.revisionEffect).toBe("WORSENED");

    const unrevised = item(["BULLISH"], "BULLISH");
    expect(forecastAccuracy(unrevised.forecast, unrevised.revisions)!.revisionEffect).toBeNull();
  });
});

describe("forecastAnalytics", () => {
  it("detects overconfidence once the sample is large enough", () => {
    const highWrong = (n: number) =>
      Array.from({ length: n }, (_, i) => item(["BULLISH"], i === 0 ? "BULLISH" : "BEARISH", { confidence: "HIGH" as Confidence }));
    const small = forecastAnalytics(highWrong(4), new Map());
    expect(small.calibrationByConfidence.find((c) => c.key === "HIGH")).toMatchObject({ count: 4, smallSample: true, verdict: null });

    const enough = forecastAnalytics(highWrong(5), new Map());
    expect(enough.calibrationByConfidence.find((c) => c.key === "HIGH")).toMatchObject({
      count: 5,
      rate: 0.2,
      verdict: "OVERCONFIDENT",
    });
    expect(enough.biasAccuracy.rate).toBe(0.2);
  });

  it("detects underconfidence and groups accuracy by setup and condition", () => {
    const setupId = newId();
    const items = Array.from({ length: 5 }, () =>
      item(["BEARISH"], "BEARISH", { confidence: "LOW", setupIds: [setupId], conditionTags: ["Trending"] }),
    );
    const a = forecastAnalytics(items, new Map([[setupId, "Opening drive"]]));
    expect(a.calibrationByConfidence.find((c) => c.key === "LOW")!.verdict).toBe("UNDERCONFIDENT");
    expect(a.accuracyBySetup).toEqual([expect.objectContaining({ label: "Opening drive", count: 5, rate: 1 })]);
    expect(a.accuracyByCondition).toEqual([expect.objectContaining({ label: "trending", count: 5 })]);
  });

  it("calibrates scenarios by their own confidence and ignores unreviewed forecasts", () => {
    const scenarioId = newId();
    const reviewed = item(
      ["BULLISH"],
      "BULLISH",
      {
        scenarios: [
          { id: scenarioId, title: "Gap fill", if: "", then: "", invalidation: "", instruments: [], setupIds: [], levelIds: [], confidence: "HIGH" },
        ],
      },
      { [scenarioId]: "INVALIDATED" },
    );
    const unreviewed = item(["BEARISH"], null);
    const a = forecastAnalytics([reviewed, unreviewed], new Map());
    expect(a.reviewedCount).toBe(1);
    expect(a.scenarioHitRate).toMatchObject({ count: 1, rate: 0 });
    expect(a.calibrationByScenario.find((c) => c.key === "HIGH")).toMatchObject({ count: 1, rate: 0 });
  });
});

describe("execution against forecast", () => {
  const row = (netPnl: number): TradeResultRow => ({
    trade: makeTrade({ status: "CLOSED" }),
    netPnl,
    rMultiple: null,
    quality: computeTradeQuality({
      checks: [],
      overrideCount: 0,
      executionRating: null,
      plannedStop: null,
      plannedRisk: null,
      actualRisk: null,
      plannedContracts: 1,
      maxOpenQuantity: null,
      rMultiple: null,
      netPnl: null,
    }),
  });
  const link = (tradeId: string, planned: boolean, adherence: ForecastTradeLink["adherence"]): ForecastTradeLink => ({
    id: newId(),
    createdAt: T,
    updatedAt: T,
    tradeId,
    planned,
    forecastId: planned ? newId() : null,
    scenarioId: planned ? newId() : null,
    revisionIdAtEntry: null,
    adherence,
    reason: adherence === "YES" ? "" : "x",
  });

  it("separates planned from unplanned and groups by adherence", () => {
    const rows = [row(100), row(-50), row(-200), row(30)];
    const links = [
      link(rows[0]!.trade.id, true, "YES"),
      link(rows[1]!.trade.id, true, "NO"),
      link(rows[2]!.trade.id, false, null),
    ];
    const e = executionAgainstForecast(rows, links);
    expect(e).toMatchObject({ linked: 3, unlinked: 1 });
    expect(e.planned.netPnl).toBe(50);
    expect(e.unplanned.netPnl).toBe(-200);
    expect(e.byAdherence.YES.count).toBe(1);
    expect(e.byAdherence.NO.count).toBe(1);
    expect(links.map(isDeviation)).toEqual([false, true, true]);
  });
});

describe("levelStats", () => {
  it("counts touches, outcomes and expected-reaction matches by level type", () => {
    const levelId = newId();
    const other = newId();
    const it1 = item(["BULLISH"], "BULLISH", {
      keyLevels: [
        { id: levelId, price: 5000, priceTo: null, instruments: [], label: "PDH", type: "PRIOR_HIGH", priority: "HIGH", expectedReaction: "REJECTION", expectedNotes: "", scenarioId: null },
        { id: other, price: 4950, priceTo: null, instruments: [], label: "PDL", type: "PRIOR_LOW", priority: "LOW", expectedReaction: null, expectedNotes: "", scenarioId: null },
      ],
    });
    const interactions: LevelInteraction[] = [
      { id: newId(), createdAt: T, updatedAt: T, forecastId: it1.forecast.id, levelId, touched: true, outcome: "REJECTION", source: "MANUAL", notes: "", tradeIds: [] },
    ];
    const stats = levelStats([it1], interactions);
    expect(stats.find((s) => s.type === "PRIOR_HIGH")).toMatchObject({ levels: 1, touched: 1, expectedMatched: 1, expectedJudged: 1 });
    expect(stats.find((s) => s.type === "PRIOR_LOW")).toMatchObject({ levels: 1, touched: 0 });
  });
});
