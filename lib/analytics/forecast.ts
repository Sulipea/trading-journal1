/**
 * Forecast analytics (spec §23, §25–28). Forecast accuracy and execution
 * against the forecast are deliberately separate: there is no combined score.
 * Everything carries its sample size; small samples are flagged.
 */
import type {
  Bias,
  Confidence,
  EntityId,
  Forecast,
  ForecastAdherence,
  ForecastKeyLevel,
  ForecastRevision,
  ForecastTradeLink,
  LevelInteraction,
  LevelReaction,
  LevelType,
  ScenarioOutcome,
} from "@/lib/domain/types";
import { latestRevision } from "@/lib/domain/forecast";
import { groupStats, type GroupStats, type TradeResultRow } from "./stats";

/** Calibration groups below this size are labelled as small samples and never flagged. */
export const MIN_CALIBRATION_SAMPLE = 5;

/** Accuracy expected from each confidence level; ±20 points beyond it counts as mis-calibrated. */
export const EXPECTED_ACCURACY: Readonly<Record<Confidence, number>> = { LOW: 0.4, MEDIUM: 0.6, HIGH: 0.8 };
const CALIBRATION_TOLERANCE = 0.2;

export function biasCorrect(forecast: Bias, actual: Bias | null): boolean | null {
  return actual === null ? null : forecast === actual;
}

// ── accuracy of one forecast ─────────────────────────────────────────────

export interface ScenarioTally {
  playedOut: number;
  partial: number;
  notTriggered: number;
  invalidated: number;
  /** (played out + ½ partial) ÷ triggered scenarios; null when none triggered. */
  hitRate: number | null;
}

export function tallyScenarios(outcomes: readonly ScenarioOutcome[]): ScenarioTally {
  const count = (o: ScenarioOutcome) => outcomes.filter((x) => x === o).length;
  const playedOut = count("PLAYED_OUT");
  const partial = count("PARTIAL");
  const invalidated = count("INVALIDATED");
  const triggered = playedOut + partial + invalidated;
  return {
    playedOut,
    partial,
    notTriggered: count("NOT_TRIGGERED"),
    invalidated,
    hitRate: triggered > 0 ? (playedOut + partial / 2) / triggered : null,
  };
}

export interface ForecastAccuracy {
  reviewed: boolean;
  originalBias: Bias;
  finalBias: Bias;
  actualBias: Bias | null;
  originalBiasCorrect: boolean | null;
  finalBiasCorrect: boolean | null;
  scenarios: ScenarioTally;
  revisionCount: number;
  /** Whether revising changed the bias call for the better, worse, or not at all. */
  revisionEffect: "IMPROVED" | "WORSENED" | "UNCHANGED" | null;
}

/** Did the expected market scenario and conditions occur? (spec §28) */
export function forecastAccuracy(forecast: Forecast, revisions: readonly ForecastRevision[]): ForecastAccuracy | null {
  const original = revisions.find((r) => r.number === 0);
  const final = latestRevision(revisions);
  if (!original || !final) return null;
  const actual = forecast.review?.actualBias ?? null;
  const originalCorrect = biasCorrect(original.content.bias, actual);
  const finalCorrect = biasCorrect(final.content.bias, actual);
  const finalScenarioIds = new Set(final.content.scenarios.map((s) => s.id));
  const outcomes = Object.entries(forecast.review?.scenarioOutcomes ?? {})
    .filter(([id]) => finalScenarioIds.has(id))
    .map(([, o]) => o);

  let revisionEffect: ForecastAccuracy["revisionEffect"] = null;
  if (final.number > 0 && originalCorrect !== null && finalCorrect !== null) {
    revisionEffect = originalCorrect === finalCorrect ? "UNCHANGED" : finalCorrect ? "IMPROVED" : "WORSENED";
  }

  return {
    reviewed: forecast.review !== null,
    originalBias: original.content.bias,
    finalBias: final.content.bias,
    actualBias: actual,
    originalBiasCorrect: originalCorrect,
    finalBiasCorrect: finalCorrect,
    scenarios: tallyScenarios(outcomes),
    revisionCount: final.number,
    revisionEffect,
  };
}

// ── across forecasts ─────────────────────────────────────────────────────

export interface ForecastWithRevisions {
  forecast: Forecast;
  revisions: ForecastRevision[];
}

export interface RateGroup {
  key: string;
  label: string;
  count: number;
  /** Fraction of hits; null without data. */
  rate: number | null;
  smallSample: boolean;
}

function rateGroup(key: string, label: string, hits: readonly number[]): RateGroup {
  return {
    key,
    label,
    count: hits.length,
    rate: hits.length > 0 ? hits.reduce((a, b) => a + b, 0) / hits.length : null,
    smallSample: hits.length < MIN_CALIBRATION_SAMPLE,
  };
}

export interface CalibrationGroup extends RateGroup {
  expected: number;
  verdict: "OVERCONFIDENT" | "UNDERCONFIDENT" | "CALIBRATED" | null;
}

function calibrationVerdict(group: RateGroup, expected: number): CalibrationGroup["verdict"] {
  if (group.rate === null || group.smallSample) return null;
  if (group.rate < expected - CALIBRATION_TOLERANCE) return "OVERCONFIDENT";
  if (group.rate > expected + CALIBRATION_TOLERANCE) return "UNDERCONFIDENT";
  return "CALIBRATED";
}

const CONFIDENCE_LEVELS: Confidence[] = ["LOW", "MEDIUM", "HIGH"];
const CONFIDENCE_LABELS: Record<Confidence, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

/** Reviewed forecasts with a bias call to judge, using the final revision. */
function judged(items: readonly ForecastWithRevisions[]) {
  return items.flatMap(({ forecast, revisions }) => {
    const final = latestRevision(revisions);
    const correct = final ? biasCorrect(final.content.bias, forecast.review?.actualBias ?? null) : null;
    return final && correct !== null ? [{ forecast, final, hit: correct ? 1 : 0 }] : [];
  });
}

export interface ForecastAnalytics {
  reviewedCount: number;
  biasAccuracy: RateGroup;
  scenarioHitRate: RateGroup;
  revisions: { improved: number; worsened: number; unchanged: number };
  calibrationByConfidence: CalibrationGroup[];
  /** Mean confidence score vs bias accuracy, for forecasts that gave a numeric score. */
  scoreCalibration: { count: number; meanScore: number | null; accuracy: number | null; smallSample: boolean };
  calibrationByScenario: CalibrationGroup[];
  accuracyBySetup: RateGroup[];
  accuracyByCondition: RateGroup[];
}

export function forecastAnalytics(
  items: readonly ForecastWithRevisions[],
  setupNames: ReadonlyMap<EntityId, string>,
): ForecastAnalytics {
  const rows = judged(items);

  const revisions = { improved: 0, worsened: 0, unchanged: 0 };
  for (const item of items) {
    const effect = forecastAccuracy(item.forecast, item.revisions)?.revisionEffect;
    if (effect === "IMPROVED") revisions.improved++;
    if (effect === "WORSENED") revisions.worsened++;
    if (effect === "UNCHANGED") revisions.unchanged++;
  }

  const calibrationByConfidence = CONFIDENCE_LEVELS.map((level) => {
    const group = rateGroup(level, CONFIDENCE_LABELS[level], rows.filter((r) => r.final.content.confidence === level).map((r) => r.hit));
    return { ...group, expected: EXPECTED_ACCURACY[level], verdict: calibrationVerdict(group, EXPECTED_ACCURACY[level]) };
  });

  const scored = rows.filter((r) => r.final.content.confidenceScore !== null);
  const scoreCalibration = {
    count: scored.length,
    meanScore: scored.length ? scored.reduce((a, r) => a + r.final.content.confidenceScore!, 0) / scored.length : null,
    accuracy: scored.length ? scored.reduce((a, r) => a + r.hit, 0) / scored.length : null,
    smallSample: scored.length < MIN_CALIBRATION_SAMPLE,
  };

  // Scenario calibration: each triggered scenario with a confidence, scored by its outcome.
  const scenarioHits = new Map<Confidence, number[]>();
  const allScenarioHits: number[] = [];
  for (const { forecast, revisions: revs } of items) {
    const final = latestRevision(revs);
    if (!final || !forecast.review) continue;
    for (const s of final.content.scenarios) {
      const outcome = forecast.review.scenarioOutcomes[s.id];
      if (!outcome || outcome === "NOT_TRIGGERED") continue;
      const hit = outcome === "PLAYED_OUT" ? 1 : outcome === "PARTIAL" ? 0.5 : 0;
      allScenarioHits.push(hit);
      if (s.confidence) scenarioHits.set(s.confidence, [...(scenarioHits.get(s.confidence) ?? []), hit]);
    }
  }
  const calibrationByScenario = CONFIDENCE_LEVELS.map((level) => {
    const group = rateGroup(level, `${CONFIDENCE_LABELS[level]}-confidence scenarios`, scenarioHits.get(level) ?? []);
    return { ...group, expected: EXPECTED_ACCURACY[level], verdict: calibrationVerdict(group, EXPECTED_ACCURACY[level]) };
  });

  const byKey = (keysOf: (r: (typeof rows)[number]) => readonly string[], label: (k: string) => string) => {
    const map = new Map<string, number[]>();
    for (const r of rows) for (const k of new Set(keysOf(r))) map.set(k, [...(map.get(k) ?? []), r.hit]);
    return [...map].map(([k, hits]) => rateGroup(k, label(k), hits)).sort((a, b) => b.count - a.count);
  };

  return {
    reviewedCount: rows.length,
    biasAccuracy: rateGroup("bias", "Bias called correctly", rows.map((r) => r.hit)),
    scenarioHitRate: rateGroup("scenarios", "Triggered scenarios that played out", allScenarioHits),
    revisions,
    calibrationByConfidence,
    scoreCalibration,
    calibrationByScenario,
    accuracyBySetup: byKey((r) => r.final.content.setupIds, (id) => setupNames.get(id) ?? "Unknown setup"),
    accuracyByCondition: byKey((r) => r.final.content.conditionTags.map((t) => t.toLowerCase()), (t) => t),
  };
}

// ── execution against the forecast ───────────────────────────────────────

export interface ExecutionAgainstForecast {
  linked: number;
  unlinked: number;
  byAdherence: Record<ForecastAdherence | "UNPLANNED", GroupStats>;
  planned: GroupStats;
  unplanned: GroupStats;
}

/** Did the trader execute according to the forecast? (spec §27–28) */
export function executionAgainstForecast(
  rows: readonly TradeResultRow[],
  links: readonly ForecastTradeLink[],
): ExecutionAgainstForecast {
  const linkByTrade = new Map(links.map((l) => [l.tradeId, l]));
  const pick = (test: (l: ForecastTradeLink) => boolean) =>
    rows.filter((r) => {
      const link = linkByTrade.get(r.trade.id);
      return link !== undefined && test(link);
    });
  const linked = rows.filter((r) => linkByTrade.has(r.trade.id)).length;
  return {
    linked,
    unlinked: rows.length - linked,
    byAdherence: {
      YES: groupStats(pick((l) => l.planned && l.adherence === "YES")),
      PARTIAL: groupStats(pick((l) => l.planned && l.adherence === "PARTIAL")),
      NO: groupStats(pick((l) => l.planned && l.adherence === "NO")),
      UNPLANNED: groupStats(pick((l) => !l.planned)),
    },
    planned: groupStats(pick((l) => l.planned)),
    unplanned: groupStats(pick((l) => !l.planned)),
  };
}

/** Partially / No / Unplanned links are deviations (spec §27). */
export function isDeviation(link: ForecastTradeLink): boolean {
  return !link.planned || link.adherence === "PARTIAL" || link.adherence === "NO";
}

// ── key levels ───────────────────────────────────────────────────────────

export interface LevelTypeStats {
  type: LevelType;
  levels: number;
  touched: number;
  outcomes: Record<LevelReaction, number>;
  /** Touched levels whose outcome matched the expected reaction. */
  expectedMatched: number;
  /** Touched levels that had both an expected reaction and a recorded outcome. */
  expectedJudged: number;
  smallSample: boolean;
}

/** Level types and how price reacted at them over time (spec §23). Uses each forecast's final revision. */
export function levelStats(
  items: readonly ForecastWithRevisions[],
  interactions: readonly LevelInteraction[],
): LevelTypeStats[] {
  const byKey = new Map(interactions.map((i) => [`${i.forecastId}|${i.levelId}`, i]));
  const stats = new Map<LevelType, LevelTypeStats>();
  const blank = (type: LevelType): LevelTypeStats => ({
    type,
    levels: 0,
    touched: 0,
    outcomes: { REACTION: 0, CONTINUATION: 0, REJECTION: 0, BREAK: 0 },
    expectedMatched: 0,
    expectedJudged: 0,
    smallSample: true,
  });

  for (const { forecast, revisions } of items) {
    const final = latestRevision(revisions);
    if (!final) continue;
    for (const level of final.content.keyLevels as ForecastKeyLevel[]) {
      const s = stats.get(level.type) ?? blank(level.type);
      s.levels++;
      const interaction = byKey.get(`${forecast.id}|${level.id}`);
      if (interaction?.touched) {
        s.touched++;
        if (interaction.outcome) {
          s.outcomes[interaction.outcome]++;
          if (level.expectedReaction) {
            s.expectedJudged++;
            if (level.expectedReaction === interaction.outcome) s.expectedMatched++;
          }
        }
      }
      s.smallSample = s.touched < MIN_CALIBRATION_SAMPLE;
      stats.set(level.type, s);
    }
  }
  return [...stats.values()].sort((a, b) => b.levels - a.levels);
}
