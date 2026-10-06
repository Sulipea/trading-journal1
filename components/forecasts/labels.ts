import type {
  Bias,
  Confidence,
  ForecastAdherence,
  GexRegime,
  LevelPriority,
  LevelReaction,
  LevelType,
  ScenarioOutcome,
} from "@/lib/domain/types";

export { BIAS_LABELS } from "@/lib/domain/forecast";

export const CONFIDENCE_LABELS: Record<Confidence, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export const GEX_LABELS: Record<GexRegime, string> = {
  POSITIVE: "Positive gamma",
  NEGATIVE: "Negative gamma",
  NEUTRAL: "Neutral / transition",
};

export const LEVEL_TYPE_LABELS: Record<LevelType, string> = {
  SUPPORT: "Support",
  RESISTANCE: "Resistance",
  PIVOT: "Pivot",
  CALL_WALL: "Call wall",
  PUT_WALL: "Put wall",
  ZERO_GAMMA: "Zero gamma",
  VWAP: "VWAP",
  PRIOR_HIGH: "Prior high",
  PRIOR_LOW: "Prior low",
  PRIOR_CLOSE: "Prior close",
  OVERNIGHT_HIGH: "Overnight high",
  OVERNIGHT_LOW: "Overnight low",
  OTHER: "Other",
};

export const PRIORITY_LABELS: Record<LevelPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export const REACTION_LABELS: Record<LevelReaction, string> = {
  REACTION: "Reaction",
  CONTINUATION: "Continuation",
  REJECTION: "Rejection",
  BREAK: "Break",
};

export const OUTCOME_LABELS: Record<ScenarioOutcome, string> = {
  PLAYED_OUT: "Played out",
  PARTIAL: "Partially",
  NOT_TRIGGERED: "Didn't trigger",
  INVALIDATED: "Invalidated",
};

export const ADHERENCE_LABELS: Record<ForecastAdherence | "UNPLANNED", string> = {
  YES: "Followed",
  PARTIAL: "Partially",
  NO: "Didn't follow",
  UNPLANNED: "Unplanned",
};

export function biasTone(bias: Bias): string {
  return bias === "BULLISH" ? "bg-positive/12 text-positive" : bias === "BEARISH" ? "bg-negative/12 text-negative" : "bg-surface-muted text-muted";
}

/** "Mon, Oct 6, 2026" for a YYYY-MM-DD trading date. */
export function formatTradingDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function biasCorrectText(correct: boolean | null): string {
  return correct === null ? "Not reviewed" : correct ? "✓ Correct" : "✗ Wrong";
}
