import type { PsychologyPhase, RequirableField, Session } from "./types";

export const SESSION_LABELS: Readonly<Record<Session, string>> = {
  ASIA: "Asia",
  LONDON: "London",
  NY_AM: "New York AM",
  NY_LUNCH: "New York lunch",
  NY_PM: "New York PM",
};

export const PSYCHOLOGY_PHASE_LABELS: Readonly<Record<PsychologyPhase, string>> = {
  BEFORE: "Before trade",
  DURING: "During trade",
  AFTER: "After trade",
};

export const REQUIRABLE_FIELD_LABELS: Readonly<Record<RequirableField, string>> = {
  plannedStop: "Planned stop",
  plannedTarget: "Planned target",
  finalStop: "Final stop",
  finalTarget: "Final target",
  session: "Session",
  marketConditions: "Market conditions",
  reasoning: "Trade reasoning",
  executionNotes: "Execution notes",
  executionRating: "Execution rating",
  notes: "Notes",
  psychologyBefore: "Psychology before trade",
  psychologyDuring: "Psychology during trade",
  psychologyAfter: "Psychology after trade",
  screenshot: "At least one screenshot",
};

/** Required before close unless changed in Settings. */
export const DEFAULT_REQUIRED_FIELDS: readonly RequirableField[] = [
  "plannedStop",
  "plannedTarget",
  "session",
  "reasoning",
  "psychologyAfter",
];

export const DEFAULT_PSYCHOLOGY_EMOTIONS: readonly string[] = [
  "Calm",
  "Confident",
  "Focused",
  "Patient",
  "Hesitant",
  "Anxious",
  "Fearful",
  "Impatient",
  "FOMO",
  "Greedy",
  "Frustrated",
  "Revenge",
  "Overconfident",
  "Bored",
  "Tired",
];

export const DEFAULT_PSYCHOLOGY_RATINGS: readonly string[] = ["Confidence", "Focus", "Discipline"];
