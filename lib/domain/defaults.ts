import type { BackupSettings, ForecastDefaults, PsychologyPhase, Reminder, RequirableField, SessionOption } from "./types";

/** Starting sessions; editable in Settings. Ids are stable and never reused. */
export const DEFAULT_SESSIONS: readonly SessionOption[] = [
  { id: "ASIA", label: "Asia", active: true },
  { id: "LONDON", label: "London", active: true },
  { id: "NY_AM", label: "New York AM", active: true },
  { id: "NY_LUNCH", label: "New York lunch", active: true },
  { id: "NY_PM", label: "New York PM", active: true },
];

/** Display name for a session id; falls back to the id for unknown ones. */
export function sessionLabel(id: string | null, sessions: readonly SessionOption[]): string {
  if (id === null) return "—";
  return sessions.find((s) => s.id === id)?.label ?? id;
}

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
  forecast: "Forecast link (or unplanned)",
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

const WEEKDAYS_MON_FRI = [0, 1, 2, 3, 4];

/** Starting reminders (spec §30); editable in Settings. Fixed ids so migrations are idempotent. */
export const DEFAULT_REMINDERS: readonly Reminder[] = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    kind: "START_OF_DAY",
    message: "Write today's forecast before the open.",
    time: "08:30",
    weekdays: WEEKDAYS_MON_FRI,
    enabled: true,
  },
  {
    id: "00000000-0000-4000-8000-0000000000a2",
    kind: "END_OF_DAY",
    message: "Close out the day: finish open trades and review your forecast.",
    time: "16:15",
    weekdays: WEEKDAYS_MON_FRI,
    enabled: true,
  },
  {
    id: "00000000-0000-4000-8000-0000000000a3",
    kind: "NEW_TRADE",
    message: "Before you enter: does this match your forecast and your setup's checklist?",
    time: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
  },
];

export const DEFAULT_FORECAST_DEFAULTS: ForecastDefaults = {
  confidence: "MEDIUM",
  conditionTags: [],
  copyPreviousKeyLevels: true,
};

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoEnabled: true,
  intervalHours: 24,
  keep: 7,
  includeScreenshots: false,
};
