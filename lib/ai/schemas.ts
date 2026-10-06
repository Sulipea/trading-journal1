/**
 * AI request/response contracts, shared by the browser and the /api/ai route.
 *
 * Every AI statement carries one of the four labels from spec §32 and cites
 * the trades (by short reference, e.g. "T3") and statistics it rests on.
 * Responses are validated twice: by structured outputs at generation, and
 * by `checkStatements` here, which also downgrades unsupported claims.
 */
import { z } from "zod";

export const AI_LABELS = ["DATA_BACKED_OBSERVATION", "INTERPRETATION", "POSSIBLE_PATTERN", "REVIEW_QUESTION"] as const;
export const aiLabelSchema = z.enum(AI_LABELS);
export type AILabel = z.infer<typeof aiLabelSchema>;

export const aiStatementSchema = z.object({
  label: aiLabelSchema,
  text: z.string(),
  /** Short trade references from the context, e.g. ["T1", "T4"]. */
  refs: z.array(z.string()),
  /** The figures from the context the statement relies on, quoted. Empty for questions. */
  evidence: z.string(),
});
export type AIStatement = z.infer<typeof aiStatementSchema>;

const statements = z.array(aiStatementSchema);

export const tradeReviewOutputSchema = z.object({
  summary: statements,
  ruleViolations: statements,
  forecastAdherence: statements,
  psychology: statements,
  execution: statements,
  qualityVsOutcome: statements,
  similarTrades: statements,
  reviewQuestions: statements,
});
export type TradeReviewOutput = z.infer<typeof tradeReviewOutputSchema>;

export const periodReviewOutputSchema = z.object({
  overview: statements,
  performance: statements,
  mistakesAndRules: statements,
  psychology: statements,
  forecastAccuracy: statements,
  execution: statements,
  setups: statements,
  marketConditions: statements,
  reviewQuestions: statements,
});
export type PeriodReviewOutput = z.infer<typeof periodReviewOutputSchema>;

export const patternsOutputSchema = z.object({
  patterns: statements,
  potentialSetups: z.array(
    z.object({ name: z.string(), description: z.string(), refs: z.array(z.string()), evidence: z.string() }),
  ),
  possibleDuplicateSetups: z.array(z.object({ setupA: z.string(), setupB: z.string(), reason: z.string() })),
  reviewQuestions: statements,
});
export type PatternsOutput = z.infer<typeof patternsOutputSchema>;

export const chatOutputSchema = z.object({ statements });
export type ChatOutput = z.infer<typeof chatOutputSchema>;

// ── requests ─────────────────────────────────────────────────────────────

/** Images the user explicitly chose to send (spec §13: only selected screenshots). */
export const aiImageSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  /** Base64 without a data: prefix. */
  data: z.string().min(1),
  caption: z.string(),
});

const context = z.record(z.string(), z.unknown());

export const aiRequestSchema = z.discriminatedUnion("task", [
  z.object({ task: z.literal("TRADE_REVIEW"), context, images: z.array(aiImageSchema).max(4) }),
  z.object({ task: z.literal("PERIOD_REVIEW"), context }),
  z.object({ task: z.literal("PATTERNS"), context }),
  z.object({
    task: z.literal("CHAT"),
    context,
    /** Earlier turns, oldest first, then the new question last. */
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(4000) }))
      .min(1)
      .max(30),
  }),
]);
export type AIRequest = z.infer<typeof aiRequestSchema>;
export type AITask = AIRequest["task"];

export const AI_OUTPUT_SCHEMAS = {
  TRADE_REVIEW: tradeReviewOutputSchema,
  PERIOD_REVIEW: periodReviewOutputSchema,
  PATTERNS: patternsOutputSchema,
  CHAT: chatOutputSchema,
} as const;
export type AIOutput<T extends AITask> = z.infer<(typeof AI_OUTPUT_SCHEMAS)[T]>;

export const aiErrorCodeSchema = z.enum(["NOT_CONFIGURED", "BAD_REQUEST", "REFUSED", "RATE_LIMITED", "PROVIDER_ERROR", "INVALID_OUTPUT"]);
export type AIErrorCode = z.infer<typeof aiErrorCodeSchema>;

export const aiResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), model: z.string(), output: z.unknown() }),
  z.object({ ok: z.literal(false), code: aiErrorCodeSchema, error: z.string() }),
]);
export type AIResponse = z.infer<typeof aiResponseSchema>;

export const aiStatusResponseSchema = z.object({ configured: z.boolean(), provider: z.string().nullable(), model: z.string().nullable() });
export type AIStatusResponse = z.infer<typeof aiStatusResponseSchema>;

// ── post-validation ──────────────────────────────────────────────────────

export interface CheckedStatement extends AIStatement {
  /** References that weren't in the context; removed from `refs`. */
  unknownRefs: string[];
  /** Relabelled to INTERPRETATION because it claimed to be data-backed but cited nothing. */
  downgraded: boolean;
}

/**
 * Enforce "analytical claims must show supporting trades/data" (spec §32):
 * drop references to trades that weren't sent, and treat a data-backed or
 * pattern claim that cites neither trades nor figures as an interpretation.
 */
export function checkStatements(list: readonly AIStatement[], knownRefs: ReadonlySet<string>): CheckedStatement[] {
  return list.map((s) => {
    const refs = s.refs.filter((r) => knownRefs.has(r));
    const unknownRefs = s.refs.filter((r) => !knownRefs.has(r));
    const claims = s.label === "DATA_BACKED_OBSERVATION" || s.label === "POSSIBLE_PATTERN";
    const unsupported = claims && refs.length === 0 && s.evidence.trim() === "";
    return {
      ...s,
      refs,
      unknownRefs,
      label: unsupported ? "INTERPRETATION" : s.label,
      downgraded: unsupported,
    };
  });
}
