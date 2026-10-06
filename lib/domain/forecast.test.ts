import { describe, expect, it } from "vitest";
import { newId } from "./ids";
import type { ForecastContent, ForecastKeyLevel, ForecastRevision, ForecastScenario } from "./types";
import {
  contentProblems,
  diffForecastContent,
  directionMatchesBias,
  emptyForecastContent,
  isForecastLocked,
  revisionActiveAt,
} from "./forecast";

const scenario = (overrides: Partial<ForecastScenario> = {}): ForecastScenario => ({
  id: newId(),
  title: "Gap fill",
  if: "Opens below PDC",
  then: "Fill to PDC",
  invalidation: "Loses ONL",
  instruments: [],
  setupIds: [],
  levelIds: [],
  confidence: null,
  ...overrides,
});
const level = (overrides: Partial<ForecastKeyLevel> = {}): ForecastKeyLevel => ({
  id: newId(),
  price: 5000,
  priceTo: null,
  instruments: ["ES"],
  label: "PDC",
  type: "PRIOR_CLOSE",
  priority: "HIGH",
  expectedReaction: "REACTION",
  expectedNotes: "",
  scenarioId: null,
  ...overrides,
});

describe("contentProblems", () => {
  it("accepts consistent content", () => {
    const l = level();
    const s = scenario({ levelIds: [l.id] });
    expect(contentProblems({ ...emptyForecastContent(), scenarios: [s], keyLevels: [{ ...l, scenarioId: s.id }] })).toEqual([]);
  });

  it("reports dangling references and inverted zones", () => {
    const content: ForecastContent = {
      ...emptyForecastContent(),
      scenarios: [scenario({ levelIds: [newId()] })],
      keyLevels: [level({ priceTo: 4990, scenarioId: newId() })],
    };
    const problems = contentProblems(content);
    expect(problems).toHaveLength(3);
  });
});

describe("diffForecastContent", () => {
  it("lists exact field, scenario and level changes", () => {
    const s = scenario();
    const l = level();
    const before: ForecastContent = { ...emptyForecastContent(), scenarios: [s], keyLevels: [l] };
    const added = scenario({ title: "Trend day" });
    const after: ForecastContent = {
      ...before,
      bias: "BULLISH",
      confidence: "HIGH",
      scenarios: [{ ...s, then: "Fill and extend" }, added],
      keyLevels: [],
    };

    const changes = diffForecastContent(before, after);
    expect(changes.map((c) => c.path)).toEqual([
      "bias",
      "confidence",
      `scenario:${s.id}.then`,
      `scenario:${added.id}`,
      `level:${l.id}`,
    ]);
    expect(changes[0]).toMatchObject({ label: "Bias", oldValue: "NEUTRAL", newValue: "BULLISH" });
    expect(changes[3]!.label).toBe('Scenario added: "Trend day"');
    expect(changes[4]!.label).toBe("Key level removed: PDC (5000)");
  });

  it("is empty for identical content", () => {
    expect(diffForecastContent(emptyForecastContent(), emptyForecastContent())).toEqual([]);
  });
});

describe("revisions and locking", () => {
  const rev = (number: number, finalizedAt: string | null): ForecastRevision => ({
    id: newId(),
    createdAt: "2026-10-06T12:00:00.000Z",
    updatedAt: "2026-10-06T12:00:00.000Z",
    forecastId: newId(),
    number,
    finalizedAt,
    reason: "",
    changes: [],
    content: emptyForecastContent(),
    snapshotId: null,
  });

  it("finds the revision active at a moment", () => {
    const revisions = [rev(0, "2026-10-06T12:00:00.000Z"), rev(1, "2026-10-06T15:00:00.000Z")];
    expect(revisionActiveAt(revisions, "2026-10-06T11:00:00.000Z")).toBeNull();
    expect(revisionActiveAt(revisions, "2026-10-06T14:00:00.000Z")?.number).toBe(0);
    expect(revisionActiveAt(revisions, "2026-10-06T16:00:00.000Z")?.number).toBe(1);
    expect(revisionActiveAt([rev(0, null)], "2026-10-06T16:00:00.000Z")).toBeNull();
  });

  it("locks forecasts for past days unless reopened", () => {
    expect(isForecastLocked({ date: "2026-10-05", reopenedAt: null }, "2026-10-06")).toBe(true);
    expect(isForecastLocked({ date: "2026-10-06", reopenedAt: null }, "2026-10-06")).toBe(false);
    expect(isForecastLocked({ date: "2026-10-05", reopenedAt: "2026-10-06T09:00:00.000Z" }, "2026-10-06")).toBe(false);
  });

  it("compares trade direction with bias", () => {
    expect(directionMatchesBias("LONG", "BULLISH")).toBe(true);
    expect(directionMatchesBias("SHORT", "BULLISH")).toBe(false);
    expect(directionMatchesBias("SHORT", "NEUTRAL")).toBeNull();
  });
});
