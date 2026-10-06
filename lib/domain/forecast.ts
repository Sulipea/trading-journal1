/**
 * Pure forecast rules: default content, validation, revision diffs, which
 * revision was active at a moment, and day locking (spec §21–27, §29).
 */
import type {
  Bias,
  Direction,
  Forecast,
  ForecastContent,
  ForecastFieldChange,
  ForecastKeyLevel,
  ForecastRevision,
  ForecastScenario,
} from "./types";

export const BIAS_LABELS: Readonly<Record<Bias, string>> = {
  BULLISH: "Bullish",
  BEARISH: "Bearish",
  NEUTRAL: "Neutral",
};

export function emptyForecastContent(): ForecastContent {
  return {
    bias: "NEUTRAL",
    marketConditions: "",
    conditionTags: [],
    setupIds: [],
    invalidation: "",
    gexRegime: null,
    gexValue: null,
    confidence: "MEDIUM",
    confidenceScore: null,
    notes: "",
    scenarios: [],
    keyLevels: [],
  };
}

/** Cross-reference problems in forecast content, as user-facing messages. */
export function contentProblems(content: ForecastContent): string[] {
  const problems: string[] = [];
  const scenarioIds = new Set(content.scenarios.map((s) => s.id));
  const levelIds = new Set(content.keyLevels.map((l) => l.id));
  if (scenarioIds.size !== content.scenarios.length) problems.push("Two scenarios share an id.");
  if (levelIds.size !== content.keyLevels.length) problems.push("Two key levels share an id.");
  for (const s of content.scenarios) {
    if (!s.title.trim()) problems.push("Every scenario needs a title.");
    if (s.levelIds.some((id) => !levelIds.has(id))) problems.push(`Scenario "${s.title}" links a key level that doesn't exist.`);
  }
  for (const l of content.keyLevels) {
    if (!Number.isFinite(l.price)) problems.push("Every key level needs a price.");
    if (l.priceTo !== null && l.priceTo < l.price) problems.push(`Zone ${l.price}–${l.priceTo} ends below where it starts.`);
    if (l.scenarioId !== null && !scenarioIds.has(l.scenarioId)) {
      problems.push(`Key level ${l.label || l.price} points to a scenario that doesn't exist.`);
    }
  }
  return [...new Set(problems)];
}

// ── diffs ────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  bias: "Bias",
  marketConditions: "Market conditions",
  conditionTags: "Condition tags",
  setupIds: "Setups",
  invalidation: "Invalidation",
  gexRegime: "GEX regime",
  gexValue: "GEX value",
  confidence: "Confidence",
  confidenceScore: "Confidence score",
  notes: "Notes",
  title: "title",
  if: "IF",
  then: "THEN",
  instruments: "instruments",
  levelIds: "levels",
  price: "price",
  priceTo: "zone top",
  label: "label",
  type: "type",
  priority: "priority",
  expectedReaction: "expected reaction",
  expectedNotes: "expected notes",
  scenarioId: "scenario",
};

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffItems<T extends { id: string }>(
  kind: "scenario" | "level",
  before: readonly T[],
  after: readonly T[],
  name: (item: T) => string,
): ForecastFieldChange[] {
  const changes: ForecastFieldChange[] = [];
  const noun = kind === "scenario" ? "Scenario" : "Key level";
  const beforeById = new Map(before.map((x) => [x.id, x]));
  const afterById = new Map(after.map((x) => [x.id, x]));

  for (const item of before) {
    if (!afterById.has(item.id)) {
      changes.push({ path: `${kind}:${item.id}`, label: `${noun} removed: ${name(item)}`, oldValue: item, newValue: null });
    }
  }
  for (const item of after) {
    const old = beforeById.get(item.id);
    if (!old) {
      changes.push({ path: `${kind}:${item.id}`, label: `${noun} added: ${name(item)}`, oldValue: null, newValue: item });
      continue;
    }
    for (const key of Object.keys(item) as (keyof T & string)[]) {
      if (key === "id" || same(old[key], item[key])) continue;
      changes.push({
        path: `${kind}:${item.id}.${key}`,
        label: `${noun} ${name(item)}: ${FIELD_LABELS[key] ?? key}`,
        oldValue: old[key],
        newValue: item[key],
      });
    }
  }
  return changes;
}

const scenarioName = (s: ForecastScenario) => `"${s.title}"`;
const levelName = (l: ForecastKeyLevel) => (l.label ? `${l.label} (${l.price})` : String(l.price));

/** Exact field-level changes from `before` to `after` (spec §25). */
export function diffForecastContent(before: ForecastContent, after: ForecastContent): ForecastFieldChange[] {
  const changes: ForecastFieldChange[] = [];
  for (const key of Object.keys(after) as (keyof ForecastContent)[]) {
    if (key === "scenarios" || key === "keyLevels") continue;
    if (!same(before[key], after[key])) {
      changes.push({ path: key, label: FIELD_LABELS[key] ?? key, oldValue: before[key], newValue: after[key] });
    }
  }
  changes.push(...diffItems("scenario", before.scenarios, after.scenarios, scenarioName));
  changes.push(...diffItems("level", before.keyLevels, after.keyLevels, levelName));
  return changes;
}

// ── revisions & locking ──────────────────────────────────────────────────

/** The finalized revision that was active at `at`, or null if none had been finalized yet. */
export function revisionActiveAt(revisions: readonly ForecastRevision[], at: string): ForecastRevision | null {
  let active: ForecastRevision | null = null;
  for (const r of revisions) {
    if (r.finalizedAt === null || r.finalizedAt > at) continue;
    if (!active || r.number > active.number) active = r;
  }
  return active;
}

/** The newest finalized revision, or the draft original. */
export function latestRevision(revisions: readonly ForecastRevision[]): ForecastRevision | null {
  return revisions.reduce<ForecastRevision | null>((a, r) => (!a || r.number > a.number ? r : a), null);
}

/** A forecast locks once its day is over, unless it was manually reopened (spec §29). */
export function isForecastLocked(forecast: Pick<Forecast, "date" | "reopenedAt">, today: string): boolean {
  return forecast.date < today && forecast.reopenedAt === null;
}

/** Does a trade's direction agree with a bias? Null for a neutral bias. */
export function directionMatchesBias(direction: Direction, bias: Bias): boolean | null {
  if (bias === "NEUTRAL") return null;
  return (direction === "LONG") === (bias === "BULLISH");
}
