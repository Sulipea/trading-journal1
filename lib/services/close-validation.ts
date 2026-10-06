/**
 * Close validation (spec §6): a trade may only close when its position is
 * flat and every required field is complete.
 */
import { FillSequenceError, summarizeFills } from "@/lib/calculations/trade";
import { checklistIssues, type ChecklistIssue } from "@/lib/domain/checklist";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type {
  ForecastTradeLink,
  PsychologyEntry,
  PsychologyPhase,
  RequirableField,
  Rule,
  RuleCheck,
  Setup,
  Trade,
  TradeEvent,
} from "@/lib/domain/types";

export interface CloseContext {
  trade: Trade;
  events: readonly TradeEvent[];
  psychology: readonly PsychologyEntry[];
  screenshotCount: number;
  /** Globally required fields (Settings). These cannot be skipped. */
  requiredFields: readonly RequirableField[];
  /** The trade's setup; its required fields can be skipped only with a reason. */
  setup?: Setup | null;
  /** Rules on the trade's checklist, and the trade's answers. */
  rules?: readonly Rule[];
  ruleChecks?: readonly RuleCheck[];
  /** The trade's forecast link, or null if it hasn't been linked or marked unplanned. */
  forecastLink?: ForecastTradeLink | null;
}

export interface CloseReadiness {
  canClose: boolean;
  /** Every entered contract has been exited. */
  positionFlat: boolean;
  /** Fills are inconsistent, e.g. more exited than entered. */
  fillError: string | null;
  /** Required fields that are still empty: global first, then the setup's. */
  missing: RequirableField[];
  /** The subset of `missing` that the setup requires and could be skipped with a reason. */
  overridable: RequirableField[];
  /** Checklist rules still unanswered, or violations missing acknowledgment/reason. */
  ruleIssues: ChecklistIssue[];
}

/** Global required fields, then setup-only required fields not skipped with a reason. */
export function effectiveRequirements(
  trade: Trade,
  requiredFields: readonly RequirableField[],
  setup: Setup | null | undefined,
): { global: RequirableField[]; setupOnly: RequirableField[] } {
  const global = [...new Set(requiredFields)];
  const skipped = new Set(trade.requirementOverrides.map((o) => o.field));
  const setupOnly = (setup?.requiredFields ?? []).filter((f) => !global.includes(f) && !skipped.has(f));
  return { global, setupOnly: [...new Set(setupOnly)] };
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
    case "forecast":
      return !ctx.forecastLink;
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

  const { global, setupOnly } = effectiveRequirements(ctx.trade, ctx.requiredFields, ctx.setup);
  const missingGlobal = global.filter((field) => isFieldMissing(field, ctx));
  const overridable = setupOnly.filter((field) => isFieldMissing(field, ctx));
  const missing = [...missingGlobal, ...overridable];
  const ruleIssues = checklistIssues(ctx.rules ?? [], ctx.ruleChecks ?? []);
  return {
    canClose: positionFlat && fillError === null && missing.length === 0 && ruleIssues.length === 0,
    positionFlat,
    fillError,
    missing,
    overridable,
    ruleIssues,
  };
}
