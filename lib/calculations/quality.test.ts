import { describe, expect, it } from "vitest";
import {
  computeTradeQuality,
  executionScore,
  gradeFor,
  riskScore,
  ruleAdherenceScore,
  type QualityInput,
} from "./quality";

const clean: QualityInput = {
  checks: [
    { severity: "HIGH", status: "FOLLOWED" },
    { severity: "LOW", status: "FOLLOWED" },
  ],
  overrideCount: 0,
  executionRating: 5,
  plannedStop: 4995,
  plannedRisk: 250,
  actualRisk: 250,
  plannedContracts: 1,
  maxOpenQuantity: 1,
  rMultiple: -1,
  netPnl: -250,
};

describe("rule adherence", () => {
  it("deducts by severity and counts overrides as process violations", () => {
    expect(ruleAdherenceScore(clean)).toBe(100);
    expect(
      ruleAdherenceScore({
        checks: [
          { severity: "LOW", status: "VIOLATED" },
          { severity: "MEDIUM", status: "VIOLATED" },
        ],
        overrideCount: 1,
      }),
    ).toBe(40);
    expect(ruleAdherenceScore({ checks: [{ severity: "HIGH", status: "VIOLATED" }], overrideCount: 2 })).toBe(0);
  });

  it("is unknown with no checks or overrides", () => {
    expect(ruleAdherenceScore({ checks: [], overrideCount: 0 })).toBeNull();
  });
});

describe("execution and risk", () => {
  it("maps execution 1–5 to 0–100", () => {
    expect(executionScore(1)).toBe(0);
    expect(executionScore(4)).toBe(75);
    expect(executionScore(null)).toBeNull();
  });

  it("scores risk management", () => {
    expect(riskScore(clean)).toBe(100);
    expect(riskScore({ ...clean, plannedStop: null })).toBe(0);
    expect(riskScore({ ...clean, maxOpenQuantity: 2, actualRisk: 500 })).toBe(40);
    expect(riskScore({ ...clean, rMultiple: -2 })).toBe(60);
    expect(riskScore({ ...clean, maxOpenQuantity: null })).toBeNull();
  });
});

describe("computeTradeQuality", () => {
  it("rates a disciplined loss highly — quality is not outcome", () => {
    const q = computeTradeQuality(clean);
    expect(q.score).toBe(100);
    expect(q.grade).toBe("A");
    expect(q.processOutcome).toBe("GOOD_PROCESS_LOSS");
  });

  it("rates an undisciplined win poorly", () => {
    const q = computeTradeQuality({
      ...clean,
      checks: [{ severity: "HIGH", status: "VIOLATED" }],
      executionRating: 2,
      maxOpenQuantity: 3,
      actualRisk: 900,
      rMultiple: 3,
      netPnl: 750,
    });
    // rules 50×0.4 + execution 25×0.3 + risk 40×0.3 = 39.5 → 40
    expect(q.score).toBe(40);
    expect(q.grade).toBe("D");
    expect(q.processOutcome).toBe("POOR_PROCESS_WIN");
  });

  it("re-weights over the components that can be judged", () => {
    const q = computeTradeQuality({ ...clean, checks: [], executionRating: null, rMultiple: null, netPnl: null });
    expect(q.components).toEqual({ rules: null, execution: null, risk: 100 });
    expect(q.score).toBe(100);
    expect(q.processOutcome).toBeNull();
  });

  it("is unknown with nothing to judge", () => {
    const q = computeTradeQuality({
      ...clean,
      checks: [],
      executionRating: null,
      maxOpenQuantity: null,
    });
    expect(q.score).toBeNull();
    expect(q.grade).toBeNull();
  });
});

describe("gradeFor", () => {
  it("maps score bands to grades", () => {
    expect([85, 84, 70, 55, 40, 39].map(gradeFor)).toEqual(["A", "B", "B", "C", "D", "F"]);
  });
});
