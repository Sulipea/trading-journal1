/**
 * Zod schemas for persisted journal entities.
 *
 * These are the validation boundary for everything written to storage and
 * the source of the domain types (see `types.ts`). Schema version 1 covers
 * the foundation entities; later phases add entities through migrations.
 */
import { z } from "zod";
import { INSTRUMENT_ROOTS } from "./instruments";

const id = z.uuid();
const timestamp = z.iso.datetime();
const price = z.number();
const quantity = z.number().int().positive();
const money = z.number();

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

export const tradeSchema = z.object({
  ...entityBase,
  status: tradeStatusSchema,
  /** Exact contract symbol as entered, e.g. `ESZ6`. */
  symbol: z.string().min(1),
  root: instrumentRootSchema,
  direction: directionSchema,

  plannedEntry: price,
  plannedStop: price.nullable(),
  plannedTarget: price.nullable(),
  plannedContracts: quantity,

  finalStop: price.nullable(),
  finalTarget: price.nullable(),

  /** Total fees/commissions for the trade, in dollars. */
  fees: money.nonnegative(),
  notes: z.string(),

  openedAt: timestamp,
  closedAt: timestamp.nullable(),
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
});
