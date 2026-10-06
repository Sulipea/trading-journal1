/**
 * Optional AI features (spec §32): post-close trade reviews, periodic review
 * interpretation, pattern discovery and journal chat.
 *
 * AI output is stored locally in its own tables and never changes journal
 * data. If the AI is unavailable or fails, the failure is recorded and the
 * journal carries on — a trade is already saved before any AI review runs.
 */
import type { AIClientError, AITransport } from "@/lib/ai/client";
import {
  buildChatContext,
  buildPatternsContext,
  buildPeriodReviewContext,
  buildTradeReviewContext,
} from "@/lib/ai/context-builder";
import type { AIStatusResponse, ChatOutput } from "@/lib/ai/schemas";
import { detectPatterns } from "@/lib/analytics/patterns";
import { BIAS_LABELS, revisionActiveAt } from "@/lib/domain/forecast";
import { newId, nowIso } from "@/lib/domain/ids";
import type { AIConversation, AIMessage, AIReview, AiStatus, EntityId } from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { inPeriod } from "@/lib/reviews/periods";
import { loadAnalyticsDataset } from "./analytics";
import { loadTradeReview } from "./reviews";
import { loadTradeWorkspace } from "./trades";

// ── status ───────────────────────────────────────────────────────────────

/**
 * AI status (spec §33): NOT_CONFIGURED without server credentials;
 * CONFIGURED when available but not switched on; ENABLED / DISABLED by choice.
 */
export function effectiveAIStatus(server: AIStatusResponse, stored: AiStatus): AiStatus {
  if (!server.configured) return "NOT_CONFIGURED";
  if (stored === "ENABLED" || stored === "DISABLED") return stored;
  return "CONFIGURED";
}

export async function setAIEnabled(repos: JournalRepositories, enabled: boolean, now: string = nowIso()) {
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, aiStatus: enabled ? "ENABLED" : "DISABLED", updatedAt: now });
}

export async function setAIAutoReview(repos: JournalRepositories, aiAutoReview: boolean, now: string = nowIso()) {
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, aiAutoReview, updatedAt: now });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The AI request failed.";
}

async function record(
  repos: JournalRepositories,
  base: Pick<AIReview, "kind" | "targetId" | "refs" | "screenshotIds">,
  run: () => Promise<{ model: string; output: unknown }>,
  now: string,
): Promise<AIReview> {
  let review: AIReview;
  try {
    const { model, output } = await run();
    review = { id: newId(), createdAt: now, updatedAt: now, ...base, status: "COMPLETE", model, output, error: "" };
  } catch (error) {
    review = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      ...base,
      status: "FAILED",
      model: "",
      output: null,
      error: errorText(error as AIClientError),
    };
  }
  await repos.ai.saveReview(review);
  return review;
}

// ── trade review ─────────────────────────────────────────────────────────

export interface AIImageInput {
  screenshotId: EntityId;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
  caption: string;
}

/** Review one closed trade. Only the screenshots passed in (chosen by the user) are sent. */
export async function runTradeAIReview(
  repos: JournalRepositories,
  tradeId: EntityId,
  transport: AITransport,
  images: readonly AIImageInput[] = [],
  now: string = nowIso(),
): Promise<AIReview> {
  const [ws, deterministic, data, link] = await Promise.all([
    loadTradeWorkspace(repos, tradeId),
    loadTradeReview(repos, tradeId),
    loadAnalyticsDataset(repos),
    repos.forecasts.getLinkForTrade(tradeId),
  ]);
  const row = data.rows.find((r) => r.trade.id === tradeId);
  if (!deterministic || !row) throw new Error("AI reviews are available once a trade is closed.");

  let forecast: Parameters<typeof buildTradeReviewContext>[0]["forecast"] = null;
  if (link) {
    let scenario: string | null = null;
    let biasAtEntry: string | null = null;
    if (link.forecastId) {
      const revisions = await repos.forecasts.listRevisions(link.forecastId);
      scenario = revisions.flatMap((r) => r.content.scenarios).find((s) => s.id === link.scenarioId)?.title ?? null;
      const atEntry = revisions.find((r) => r.id === link.revisionIdAtEntry) ?? revisionActiveAt(revisions, ws.trade.openedAt);
      biasAtEntry = atEntry ? BIAS_LABELS[atEntry.content.bias] : null;
    }
    forecast = { scenario, adherence: link.planned ? (link.adherence ?? "") : "UNPLANNED", reason: link.reason, biasAtEntry };
  }

  const { context, refs } = buildTradeReviewContext({
    row,
    trade: ws.trade,
    events: ws.events,
    metrics: ws.metrics,
    psychology: ws.psychology,
    checks: ws.ruleChecks,
    forecast,
    deterministic,
    screenshotCaptions: images.map((i) => i.caption),
  });
  return record(
    repos,
    { kind: "TRADE", targetId: tradeId, refs, screenshotIds: images.map((i) => i.screenshotId) },
    () =>
      transport({
        task: "TRADE_REVIEW",
        context,
        images: images.map(({ mediaType, data: imageData, caption }) => ({ mediaType, data: imageData, caption })),
      }),
    now,
  );
}

// ── periodic review ──────────────────────────────────────────────────────

export async function runPeriodAIReview(
  repos: JournalRepositories,
  reviewId: EntityId,
  transport: AITransport,
  now: string = nowIso(),
): Promise<AIReview> {
  const review = await repos.reviews.get(reviewId);
  if (!review) throw new Error("Review not found.");
  const [findings, data] = await Promise.all([repos.reviews.listFindings(reviewId), loadAnalyticsDataset(repos)]);
  const rows = data.rows.filter((r) => inPeriod(r.day, { start: review.periodStart, end: review.periodEnd }));
  const { context, refs } = buildPeriodReviewContext(review, findings, rows);
  return record(
    repos,
    { kind: "PERIOD", targetId: reviewId, refs, screenshotIds: [] },
    () => transport({ task: "PERIOD_REVIEW", context }),
    now,
  );
}

// ── pattern discovery ────────────────────────────────────────────────────

export async function runPatternDiscovery(
  repos: JournalRepositories,
  transport: AITransport,
  now: string = nowIso(),
): Promise<AIReview> {
  const data = await loadAnalyticsDataset(repos);
  if (data.rows.length === 0) throw new Error("Close some trades first — there is nothing to analyse yet.");
  const { context, refs } = buildPatternsContext(data.rows, data.setups, detectPatterns(data.rows));
  return record(
    repos,
    { kind: "PATTERNS", targetId: null, refs, screenshotIds: [] },
    () => transport({ task: "PATTERNS", context }),
    now,
  );
}

// ── chat ─────────────────────────────────────────────────────────────────

/** Plain-text version of an assistant answer, for sending the conversation history back. */
export function chatOutputText(output: ChatOutput): string {
  return output.statements.map((s) => `[${s.label}] ${s.text}`).join("\n");
}

/**
 * Ask a question about the journal. Stores the question and the answer (or
 * the error) in a conversation; returns the conversation id.
 */
export async function sendChatMessage(
  repos: JournalRepositories,
  conversationId: EntityId | null,
  question: string,
  transport: AITransport,
  now: string = nowIso(),
): Promise<EntityId> {
  const text = question.trim();
  if (!text) throw new Error("Type a question first.");

  let conversation: AIConversation | undefined = conversationId ? await repos.ai.getConversation(conversationId) : undefined;
  if (!conversation) {
    conversation = { id: newId(), createdAt: now, updatedAt: now, title: text.length > 60 ? `${text.slice(0, 57)}…` : text };
  }
  const history = await repos.ai.listMessages(conversation.id);
  const userMessage: AIMessage = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    conversationId: conversation.id,
    role: "USER",
    text,
    output: null,
    refs: {},
    model: "",
    error: "",
  };
  await repos.ai.saveConversation({ ...conversation, updatedAt: now });
  await repos.ai.saveMessage(userMessage);

  const [data, rules] = await Promise.all([loadAnalyticsDataset(repos), repos.rules.list()]);
  const { context, refs } = buildChatContext({
    rows: data.rows,
    setups: data.setups,
    rules,
    patterns: detectPatterns(data.rows),
    startingBalance: data.startingBalance,
    today: data.today,
  });
  const messages = [
    ...history
      .filter((m) => m.role === "USER" || m.error === "")
      .map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        text: m.role === "USER" ? m.text : chatOutputText(m.output as ChatOutput),
      })),
    { role: "user" as const, text },
  ].slice(-30);

  // Timestamps one millisecond later keep the answer after the question.
  const answeredAt = new Date(Date.parse(now) + 1).toISOString();
  const answer: AIMessage = {
    id: newId(),
    createdAt: answeredAt,
    updatedAt: answeredAt,
    conversationId: conversation.id,
    role: "ASSISTANT",
    text: "",
    output: null,
    refs,
    model: "",
    error: "",
  };
  try {
    const result = await transport({ task: "CHAT", context, messages });
    await repos.ai.saveMessage({ ...answer, output: result.output, model: result.model });
  } catch (error) {
    await repos.ai.saveMessage({ ...answer, error: errorText(error) });
  }
  return conversation.id;
}
