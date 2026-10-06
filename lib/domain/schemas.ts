/**
 * Zod schemas for persisted journal entities.
 *
 * These are the validation boundary for everything written to storage and
 * the source of the domain types (see `types.ts`). The IndexedDB layout and
 * data upgrades for each schema version live in `lib/db/migrations.ts`.
 */
import { z } from "zod";
import { INSTRUMENT_ROOTS } from "./instruments";

const id = z.uuid();
const timestamp = z.iso.datetime();
const price = z.number();
const quantity = z.number().int().positive();
const money = z.number();
const rating = z.number().int().min(1).max(5);

/** Fields every persisted entity carries. */
const entityBase = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const directionSchema = z.enum(["LONG", "SHORT"]);
export const instrumentRootSchema = z.enum(INSTRUMENT_ROOTS);

/** Trade lifecycle (spec §6): OPEN -> UPDATED -> CLOSED. */
export const tradeStatusSchema = z.enum(["OPEN", "UPDATED", "CLOSED"]);

/** Id of a trading session defined in app settings. */
export const sessionSchema = z.string().min(1);

/** A trading session the user can pick. Hidden sessions stay valid on old trades. */
export const sessionOptionSchema = z.object({
  id: sessionSchema,
  label: z.string().trim().min(1),
  active: z.boolean(),
});

export const requirableFieldSchema = z.enum([
  "plannedStop",
  "plannedTarget",
  "finalStop",
  "finalTarget",
  "session",
  "marketConditions",
  "reasoning",
  "executionNotes",
  "executionRating",
  "notes",
  "psychologyBefore",
  "psychologyDuring",
  "psychologyAfter",
  "screenshot",
  "forecast",
]);

export const requirementOverrideSchema = z.object({
  field: requirableFieldSchema,
  reason: z.string().trim().min(1),
  at: timestamp,
});

export const tradeSchema = z.object({
  ...entityBase,
  status: tradeStatusSchema,
  /** Exact contract symbol as entered, e.g. `ESZ6`. */
  symbol: z.string().min(1),
  root: instrumentRootSchema,
  direction: directionSchema,

  // Market data
  session: sessionSchema.nullable(),
  marketConditions: z.string(),

  // Trade reasoning
  reasoning: z.string(),

  // Risk
  plannedEntry: price,
  plannedStop: price.nullable(),
  plannedTarget: price.nullable(),
  plannedContracts: quantity,
  finalStop: price.nullable(),
  finalTarget: price.nullable(),
  /** Total fees/commissions for the trade, in dollars. */
  fees: money.nonnegative(),

  // Execution
  executionNotes: z.string(),
  /** Self-assessed execution, 1 (poor) – 5 (excellent). */
  executionRating: rating.nullable(),

  notes: z.string(),

  // Setup & rules
  setupId: id.nullable(),
  /** Setup requirements skipped on purpose; each counts as a process violation (spec §6). */
  requirementOverrides: z.array(requirementOverrideSchema),
  /** Set automatically by a high-severity rule violation (spec §17); cleared by the user. */
  flaggedForReview: z.boolean(),

  openedAt: timestamp,
  closedAt: timestamp.nullable(),
  /** True while a closed trade's locked fields have been manually unlocked (spec §14). */
  unlocked: z.boolean(),
  /** Set when the trade is in the recycle bin (spec §15). */
  deletedAt: timestamp.nullable(),
});

export const tradeEventTypeSchema = z.enum(["ENTRY", "EXIT"]);

/** A single fill within a trade (spec §8). */
export const tradeEventSchema = z.object({
  ...entityBase,
  tradeId: id,
  type: tradeEventTypeSchema,
  price,
  quantity,
  timestamp,
  reason: z.string(),
  notes: z.string(),
});

export const psychologyPhaseSchema = z.enum(["BEFORE", "DURING", "AFTER"]);

/** Psychology captured before, during or after a trade (spec §12). One per trade per phase. */
export const psychologyEntrySchema = z.object({
  ...entityBase,
  tradeId: id,
  phase: psychologyPhaseSchema,
  emotions: z.array(z.string().min(1)),
  /** Rating name → 1–5. Rating names come from app settings. */
  ratings: z.record(z.string().min(1), rating),
  text: z.string(),
});

/** Coordinates are fractions (0–1) of the image size, so annotations scale with the image. */
const unit = z.number().min(0).max(1);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const annotationShapeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pen"), color, points: z.array(z.tuple([unit, unit])).min(2) }),
  z.object({ kind: z.literal("rect"), color, x: unit, y: unit, w: unit, h: unit }),
  z.object({ kind: z.literal("arrow"), color, x1: unit, y1: unit, x2: unit, y2: unit }),
  z.object({ kind: z.literal("text"), color, x: unit, y: unit, text: z.string().min(1) }),
]);

export const tradeScreenshotSchema = z.object({
  ...entityBase,
  tradeId: id,
  fileName: z.string(),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().nonnegative(),
  caption: z.string(),
  /** Full-resolution image in the asset store. */
  assetId: id,
  /** Small preview image in the asset store. */
  thumbnailAssetId: id,
});

/** One saved stage of annotations on a screenshot. Saving always creates a new version. */
export const screenshotAnnotationVersionSchema = z.object({
  ...entityBase,
  screenshotId: id,
  tradeId: id,
  /** Stage label, e.g. "Entry", "Exit", "Review". */
  label: z.string().min(1),
  shapes: z.array(annotationShapeSchema),
});

/** Binary data (images) stored locally. */
export const assetSchema = z.object({
  id,
  createdAt: timestamp,
  mimeType: z.string().min(1),
  blob: z.instanceof(Blob),
});

export const changeHistorySchema = z.object({
  ...entityBase,
  entityType: z.string().min(1),
  entityId: id,
  field: z.string().min(1),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  changedAt: timestamp,
});

export const trashItemSchema = z.object({
  ...entityBase,
  entityType: z.string().min(1),
  entityId: id,
  deletedAt: timestamp,
});

// ── setups & rules (spec §16, §17) ─────────────────────────────────────

export const ruleSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

/** A named group of rules. Groups nest via `parentId` to form a hierarchy. */
export const ruleGroupSchema = z.object({
  ...entityBase,
  name: z.string().trim().min(1),
  parentId: id.nullable(),
  order: z.number().int(),
});

export const ruleSchema = z.object({
  ...entityBase,
  name: z.string().trim().min(1),
  description: z.string(),
  severity: ruleSeveritySchema,
  groupId: id.nullable(),
  /** Required rules must be marked followed/violated before a trade can close. */
  required: z.boolean(),
  active: z.boolean(),
  /** ALL: every trade's checklist. SETUPS: only trades using a setup that links it. */
  appliesTo: z.enum(["ALL", "SETUPS"]),
  order: z.number().int(),
});

export const SETUP_CATEGORIES = [
  "Breakout",
  "Pullback",
  "Reversal",
  "Range",
  "Trend continuation",
  "Opening drive",
  "Other",
] as const;
export const setupCategorySchema = z.enum(SETUP_CATEGORIES);

export const setupSchema = z.object({
  ...entityBase,
  name: z.string().trim().min(1),
  description: z.string(),
  category: setupCategorySchema,
  tags: z.array(z.string().trim().min(1)),
  /** Required to close, in addition to the global required fields. Everything else is optional. */
  requiredFields: z.array(requirableFieldSchema),
  /** Inactive setups are archived: kept for history, not offered for new trades. */
  active: z.boolean(),
  /** Set when this setup was merged into another (spec §16). */
  mergedIntoId: id.nullable(),
});

/** Links a rule into a setup's checklist. */
export const setupRuleSchema = z.object({
  ...entityBase,
  setupId: id,
  ruleId: id,
  order: z.number().int(),
});

export const setupMergeHistorySchema = z.object({
  ...entityBase,
  sourceSetupId: id,
  targetSetupId: id,
  /** Names at the time of the merge, preserved even if renamed later. */
  sourceName: z.string(),
  targetName: z.string(),
  mergedAt: timestamp,
});

export const ruleCheckStatusSchema = z.enum(["FOLLOWED", "VIOLATED"]);

/**
 * A trade's answer for one checklist rule. Violations are checks with
 * status VIOLATED. Rule name and severity are snapshotted so later rule
 * edits never rewrite history.
 */
export const ruleCheckSchema = z.object({
  ...entityBase,
  tradeId: id,
  ruleId: id,
  ruleName: z.string(),
  severity: ruleSeveritySchema,
  status: ruleCheckStatusSchema,
  acknowledged: z.boolean(),
  reason: z.string(),
});

// ── forecasts (spec §21–29) ───────────────────────────────────────────────

/** Calendar day in the journal timezone, e.g. `2026-10-06`. */
export const tradingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const biasSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export const confidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const gexRegimeSchema = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]);
export const levelTypeSchema = z.enum([
  "SUPPORT",
  "RESISTANCE",
  "PIVOT",
  "CALL_WALL",
  "PUT_WALL",
  "ZERO_GAMMA",
  "VWAP",
  "PRIOR_HIGH",
  "PRIOR_LOW",
  "PRIOR_CLOSE",
  "OVERNIGHT_HIGH",
  "OVERNIGHT_LOW",
  "OTHER",
]);
export const levelPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
/** How price behaves at a level: expected in the forecast, observed afterwards. */
export const levelReactionSchema = z.enum(["REACTION", "CONTINUATION", "REJECTION", "BREAK"]);

/** A key level or zone. Stable `id` across revisions so interactions and links survive revisions. */
export const forecastKeyLevelSchema = z.object({
  id,
  price,
  /** Upper bound when the level is a zone. */
  priceTo: price.nullable(),
  /** Empty = global (all instruments); one = instrument-specific; several = multi-instrument. */
  instruments: z.array(instrumentRootSchema),
  label: z.string(),
  type: levelTypeSchema,
  priority: levelPrioritySchema,
  expectedReaction: levelReactionSchema.nullable(),
  expectedNotes: z.string(),
  scenarioId: id.nullable(),
});

/** IF / THEN / INVALIDATION scenario. Stable `id` across revisions so trades can link to it. */
export const forecastScenarioSchema = z.object({
  id,
  title: z.string().trim().min(1),
  if: z.string(),
  then: z.string(),
  invalidation: z.string(),
  /** Empty = all instruments. */
  instruments: z.array(instrumentRootSchema),
  setupIds: z.array(id),
  levelIds: z.array(id),
  confidence: confidenceSchema.nullable(),
});

/** Everything a forecast says. Each revision stores a complete copy. */
export const forecastContentSchema = z.object({
  bias: biasSchema,
  marketConditions: z.string(),
  /** Short condition labels (e.g. Trending, Range, High volatility) for calibration analysis. */
  conditionTags: z.array(z.string().trim().min(1)),
  setupIds: z.array(id),
  invalidation: z.string(),
  gexRegime: gexRegimeSchema.nullable(),
  gexValue: z.number().nullable(),
  confidence: confidenceSchema,
  /** Optional 0–100. */
  confidenceScore: z.number().int().min(0).max(100).nullable(),
  notes: z.string(),
  scenarios: z.array(forecastScenarioSchema),
  keyLevels: z.array(forecastKeyLevelSchema),
});

export const scenarioOutcomeSchema = z.enum(["PLAYED_OUT", "PARTIAL", "NOT_TRIGGERED", "INVALIDATED"]);

/** End-of-day review: what actually happened (spec §29). Separate from the forecast itself. */
export const forecastReviewSchema = z.object({
  actualBias: biasSchema.nullable(),
  actualOutcome: z.string(),
  /** Scenario id → outcome, for scenarios in the final revision. */
  scenarioOutcomes: z.record(id, scenarioOutcomeSchema),
  notes: z.string(),
  reviewedAt: timestamp,
});

export const forecastSchema = z.object({
  ...entityBase,
  date: tradingDateSchema,
  /** DRAFT until explicitly finalized; revisions only after that. */
  status: z.enum(["DRAFT", "FINAL"]),
  activeRevisionId: id,
  /** Set when a past day's forecast is manually reopened; cleared when locked again. */
  reopenedAt: timestamp.nullable(),
  review: forecastReviewSchema.nullable(),
});

export const forecastFieldChangeSchema = z.object({
  /** e.g. `bias`, `scenario:<id>.then`, `level:<id>.price`, `scenario:<id>` (added/removed). */
  path: z.string().min(1),
  label: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

/** One version of a forecast. Immutable once finalized (spec §25). */
export const forecastRevisionSchema = z.object({
  ...entityBase,
  forecastId: id,
  /** 0 = the original forecast. */
  number: z.number().int().nonnegative(),
  /** Null only for the original while the forecast is still a draft. */
  finalizedAt: timestamp.nullable(),
  /** Why it changed. Empty for the original. */
  reason: z.string(),
  changes: z.array(forecastFieldChangeSchema),
  content: forecastContentSchema,
  /** The market-condition snapshot that prompted this revision, if any. */
  snapshotId: id.nullable(),
});

/** Manual market-condition snapshot taken during the day (spec §24). */
export const marketSnapshotSchema = z.object({
  ...entityBase,
  forecastId: id,
  at: timestamp,
  conditions: z.string().trim().min(1),
  conditionTags: z.array(z.string().trim().min(1)),
  bias: biasSchema.nullable(),
  notes: z.string(),
});

/** What happened at a key level (spec §23). Not part of the forecast, so recording it never revises it. */
export const levelInteractionSchema = z.object({
  ...entityBase,
  forecastId: id,
  levelId: id,
  touched: z.boolean(),
  outcome: levelReactionSchema.nullable(),
  /** AUTO when confirmed from a detected touch (fills near the level). */
  source: z.enum(["MANUAL", "AUTO"]),
  notes: z.string(),
  tradeIds: z.array(id),
});

export const forecastAdherenceSchema = z.enum(["YES", "PARTIAL", "NO"]);

/** Links a trade to a forecast and scenario, or marks it unplanned (spec §27). */
export const forecastTradeLinkSchema = z.object({
  ...entityBase,
  tradeId: id,
  planned: z.boolean(),
  forecastId: id.nullable(),
  scenarioId: id.nullable(),
  /** Revision active when the trade was opened, if any was finalized by then. */
  revisionIdAtEntry: id.nullable(),
  adherence: forecastAdherenceSchema.nullable(),
  /** Required for Partially, No and Unplanned. */
  reason: z.string(),
});

// ── reviews (spec §31) ────────────────────────────────────────────────────

export const reviewKindSchema = z.enum(["WEEKLY", "MONTHLY"]);
export const reviewSectionSchema = z.enum([
  "PERFORMANCE",
  "RULES",
  "PSYCHOLOGY",
  "FORECAST",
  "EXECUTION",
  "SETUPS",
  "CONDITIONS",
]);
/** Deterministic findings are data-backed observations, possible patterns, or questions to reflect on. */
export const findingKindSchema = z.enum(["OBSERVATION", "PATTERN", "QUESTION"]);

/** A generated weekly or monthly review. Findings live in their own table, attached to it. */
export const reviewSchema = z.object({
  ...entityBase,
  kind: reviewKindSchema,
  /** Inclusive trading dates. Weeks start on Monday. */
  periodStart: tradingDateSchema,
  periodEnd: tradingDateSchema,
  /** OPEN while the period is running (refreshed automatically); COMPLETE once it has ended. */
  status: z.enum(["OPEN", "COMPLETE"]),
  generatedAt: timestamp,
  tradeCount: z.number().int().nonnegative(),
  netPnl: money,
  /** Your own reflection on the period. */
  notes: z.string(),
});

export const reviewFindingSchema = z.object({
  ...entityBase,
  reviewId: id,
  /** Stable across regenerations, so the important flag survives a refresh. */
  key: z.string().min(1),
  section: reviewSectionSchema,
  kind: findingKindSchema,
  title: z.string().min(1),
  detail: z.string(),
  tradeIds: z.array(id),
  important: z.boolean(),
  /** An important finding that the latest data no longer produces. Kept, never silently deleted. */
  stale: z.boolean(),
  order: z.number().int(),
});

// ── AI (spec §32–33) ──────────────────────────────────────────────────────
// AI output is stored locally and kept apart from journal data: the AI never
// writes trades, rules, setups or forecasts.

/** Short trade reference sent to the AI (e.g. "T3") → trade id. */
const aiRefs = z.record(z.string(), id);

export const aiReviewSchema = z.object({
  ...entityBase,
  /** TRADE: post-close trade review; PERIOD: weekly/monthly review; PATTERNS: pattern discovery. */
  kind: z.enum(["TRADE", "PERIOD", "PATTERNS"]),
  /** Trade id or review id; null for pattern discovery. */
  targetId: id.nullable(),
  status: z.enum(["COMPLETE", "FAILED"]),
  model: z.string(),
  /** The validated AI output (shape depends on `kind`). Null when failed. */
  output: z.unknown(),
  refs: aiRefs,
  /** Screenshots the user chose to include. */
  screenshotIds: z.array(id),
  error: z.string(),
});

export const aiConversationSchema = z.object({
  ...entityBase,
  title: z.string(),
});

export const aiMessageSchema = z.object({
  ...entityBase,
  conversationId: id,
  role: z.enum(["USER", "ASSISTANT"]),
  /** The user's question; empty for assistant messages. */
  text: z.string(),
  /** Validated chat output for assistant messages. */
  output: z.unknown(),
  refs: aiRefs,
  model: z.string(),
  error: z.string(),
});

export const ACCOUNT_SETTINGS_ID = "00000000-0000-4000-8000-000000000001";
export const APP_SETTINGS_ID = "00000000-0000-4000-8000-000000000002";

export const accountSettingsSchema = z.object({
  ...entityBase,
  /** Manually entered starting balance in dollars (spec §10). */
  startingBalance: money,
});

export const aiStatusSchema = z.enum(["NOT_CONFIGURED", "CONFIGURED", "ENABLED", "DISABLED"]);

export const appSettingsSchema = z.object({
  ...entityBase,
  /** IANA timezone name used for session/day boundaries. */
  timezone: z.string().min(1),
  aiStatus: aiStatusSchema,
  /** Fields that must be complete before any trade can close (spec §6). */
  requiredFields: z.array(requirableFieldSchema),
  /** Predefined emotions offered in psychology entries (spec §12). */
  psychologyEmotions: z.array(z.string().min(1)),
  /** Rating scales offered in psychology entries, each scored 1–5. */
  psychologyRatings: z.array(z.string().min(1)),
  /** Trading sessions offered on trades, in display order. */
  sessions: z.array(sessionOptionSchema),
  /** When AI is enabled, review each trade automatically when it closes (spec §32). */
  aiAutoReview: z.boolean(),
});
