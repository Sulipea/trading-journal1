/**
 * Close validation (spec §6): a trade may only close when its position is
 * flat and every required field is complete.
 */
import { FillSequenceError, summarizeFills } from "@/lib/calculations/trade";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type {
  PsychologyEntry,
  PsychologyPhase,
  RequirableField,
  Trade,
  TradeEvent,
} from "@/lib/domain/types";

export interface CloseContext {
  trade: Trade;
  events: readonly TradeEvent[];
  psychology: readonly PsychologyEntry[];
  screenshotCount: number;
  requiredFields: readonly RequirableField[];
}

export interface CloseReadiness {
  canClose: boolean;
  /** Every entered contract has been exited. */
  positionFlat: boolean;
  /** Fills are inconsistent, e.g. more exited than entered. */
  fillError: string | null;
  /** Required fields that are still empty, in settings order. */
  missing: RequirableField[];
}

const PSYCHOLOGY_FIELDS: Partial<Record<RequirableField, PsychologyPhase>> = {
  psychologyBefore: "BEFORE",
  psychologyDuring: "DURING",
  psychologyAfter: "AFTER",
};

function isBlank(value: string): boolean {
  return value.trim() === "";
}

function hasPsychology(entries: readonly PsychologyEntry[], phase: PsychologyPhase): boolean {
  const entry = entries.find((e) => e.phase === phase);
  return (
    entry !== undefined &&
    (entry.emotions.length > 0 || Object.keys(entry.ratings).length > 0 || !isBlank(entry.text))
  );
}

export function isFieldMissing(field: RequirableField, ctx: Omit<CloseContext, "requiredFields" | "events">): boolean {
  const { trade } = ctx;
  const phase = PSYCHOLOGY_FIELDS[field];
  if (phase) return !hasPsychology(ctx.psychology, phase);

  switch (field) {
    case "plannedStop":
    case "plannedTarget":
    case "finalStop":
    case "finalTarget":
    case "session":
    case "executionRating":
      return trade[field] === null;
    case "marketConditions":
    case "reasoning":
    case "executionNotes":
    case "notes":
      return isBlank(trade[field]);
    case "screenshot":
      return ctx.screenshotCount === 0;
    default:
      return false;
  }
}

export function checkCloseReadiness(ctx: CloseContext): CloseReadiness {
  let positionFlat = false;
  let fillError: string | null = null;
  try {
    positionFlat = summarizeFills(
      ctx.events,
      ctx.trade.direction,
      CONTRACT_SPECS[ctx.trade.root],
      ctx.trade.fees,
    ).isFlat;
  } catch (error) {
    if (!(error instanceof FillSequenceError)) throw error;
    fillError = error.message;
  }

  const missing = ctx.requiredFields.filter((field) => isFieldMissing(field, ctx));
  return {
    canClose: positionFlat && fillError === null && missing.length === 0,
    positionFlat,
    fillError,
    missing,
  };
}
