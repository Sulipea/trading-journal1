/**
 * Trade quality (spec §11). Deterministic and independent of the outcome:
 * a losing trade can score high and a winning trade low. The outcome is
 * only used afterwards to place the trade in a process-vs-outcome quadrant.
 */
import type { RuleCheckStatus, RuleSeverity } from "@/lib/domain/types";
import type { AutoViolation } from "./process-checks";

export interface QualityInput {
  checks: readonly { severity: RuleSeverity; status: RuleCheckStatus }[];
  /** Setup requirements skipped with a reason; each is a process violation. */
  overrideCount: number;
  /** Violations the trade data itself shows (see process-checks). */
  autoViolations: readonly AutoViolation[];
  /** Was a stop order attached when the trade was entered? null = not recorded. */
  stopAtEntry: boolean | null;
  /** Self-assessed execution 1–5, if given. */
  executionRating: number | null;
  plannedStop: number | null;
  plannedRisk: number | null;
  actualRisk: number | null;
  plannedContracts: number;
  maxOpenQuantity: number | null;
  /** Only once flat. */
  rMultiple: number | null;
  /** Only once flat. */
  netPnl: number | null;
}

export interface QualityComponents {
  /** 0–100 or null if nothing to judge. */
  rules: number | null;
  execution: number | null;
  risk: number | null;
}

export type ProcessOutcome =
  | "GOOD_PROCESS_WIN"
  | "GOOD_PROCESS_LOSS"
  | "POOR_PROCESS_WIN"
  | "POOR_PROCESS_LOSS"
  | "BREAKEVEN";

export interface TradeQuality {
  /** 0–100, or null when no component can be judged yet. */
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  components: QualityComponents;
  /** Process vs outcome alignment, once the trade is flat and scored. */
  processOutcome: ProcessOutcome | null;
  autoViolations: readonly AutoViolation[];
  /** Things worth a second look that don't change the score, e.g. a self-rating that contradicts an emotion. */
  notes: readonly string[];
}

/** Points deducted from rule adherence per violation. */
export const VIOLATION_PENALTY: Readonly<Record<RuleSeverity, number>> = { LOW: 10, MEDIUM: 25, HIGH: 50 };
/** Each skipped setup requirement counts like a medium violation. */
export const OVERRIDE_PENALTY = 25;
export const QUALITY_WEIGHTS: Readonly<Record<keyof QualityComponents, number>> = {
  rules: 0.4,
  execution: 0.3,
  risk: 0.3,
};
/** Scores at or above this count as good process. */
export const GOOD_PROCESS_THRESHOLD = 70;
/** A rule or risk component below this makes the process poor, whatever the overall score. */
export const COMPONENT_FLOOR = 50;

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function ruleAdherenceScore(
  input: Pick<QualityInput, "checks" | "overrideCount"> & Partial<Pick<QualityInput, "autoViolations">>,
): number | null {
  const auto = input.autoViolations ?? [];
  if (input.checks.length === 0 && input.overrideCount === 0 && auto.length === 0) return null;
  const penalty =
    input.checks.reduce((sum, c) => sum + (c.status === "VIOLATED" ? VIOLATION_PENALTY[c.severity] : 0), 0) +
    auto.reduce((sum, v) => sum + VIOLATION_PENALTY[v.severity], 0) +
    input.overrideCount * OVERRIDE_PENALTY;
  return clamp(100 - penalty);
}

export function executionScore(rating: number | null): number | null {
  return rating === null ? null : clamp((rating - 1) * 25);
}

/**
 * Risk management, from what happened rather than what was planned: a stop
 * was planned and attached at entry, size stayed within plan, risk taken
 * stayed within 10% of plan, and the loss stayed within planned risk. A loss
 * well beyond planned risk caps the score — 1.5R lost scores at most 50 and
 * 2R or more scores 0.
 */
export function riskScore(
  input: Pick<
    QualityInput,
    "plannedStop" | "plannedRisk" | "actualRisk" | "plannedContracts" | "maxOpenQuantity" | "rMultiple"
  > &
    Partial<Pick<QualityInput, "stopAtEntry">>,
): number | null {
  if (input.maxOpenQuantity === null) return null;
  if (input.plannedStop === null) return 0;
  let score = 100;
  if (input.stopAtEntry === false) score -= 50;
  if (input.maxOpenQuantity > input.plannedContracts) score -= 30;
  if (input.plannedRisk !== null && input.actualRisk !== null && input.actualRisk > input.plannedRisk * 1.1) {
    score -= 30;
  }
  if (input.rMultiple !== null && input.rMultiple < -1) {
    score = Math.min(score, 100 - (-input.rMultiple - 1) * 100);
  }
  return clamp(Math.round(score));
}

export function gradeFor(score: number | null): TradeQuality["grade"] {
  if (score === null) return null;
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function computeTradeQuality(input: QualityInput, notes: readonly string[] = []): TradeQuality {
  const components: QualityComponents = {
    rules: ruleAdherenceScore(input),
    execution: executionScore(input.executionRating),
    risk: riskScore(input),
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const key of Object.keys(components) as (keyof QualityComponents)[]) {
    const value = components[key];
    if (value === null) continue;
    weighted += value * QUALITY_WEIGHTS[key];
    totalWeight += QUALITY_WEIGHTS[key];
  }
  const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : null;

  let processOutcome: ProcessOutcome | null = null;
  if (score !== null && input.netPnl !== null) {
    const highViolation =
      input.checks.some((c) => c.status === "VIOLATED" && c.severity === "HIGH") ||
      input.autoViolations.some((v) => v.severity === "HIGH");
    const weakComponent = [components.rules, components.risk].some((v) => v !== null && v < COMPONENT_FLOOR);
    const good = score >= GOOD_PROCESS_THRESHOLD && !highViolation && !weakComponent;
    if (input.netPnl === 0) processOutcome = "BREAKEVEN";
    else if (input.netPnl > 0) processOutcome = good ? "GOOD_PROCESS_WIN" : "POOR_PROCESS_WIN";
    else processOutcome = good ? "GOOD_PROCESS_LOSS" : "POOR_PROCESS_LOSS";
  }

  return { score, grade: gradeFor(score), components, processOutcome, autoViolations: input.autoViolations, notes };
}

export const PROCESS_OUTCOME_LABELS: Readonly<Record<ProcessOutcome, string>> = {
  GOOD_PROCESS_WIN: "Good process · win",
  GOOD_PROCESS_LOSS: "Good process · loss",
  POOR_PROCESS_WIN: "Poor process · win",
  POOR_PROCESS_LOSS: "Poor process · loss",
  BREAKEVEN: "Breakeven",
};
