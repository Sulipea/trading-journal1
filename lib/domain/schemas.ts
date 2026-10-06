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

/** Trading session the trade was taken in. */
export const sessionSchema = z.enum(["ASIA", "LONDON", "NY_AM", "NY_LUNCH", "NY_PM"]);

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
});
