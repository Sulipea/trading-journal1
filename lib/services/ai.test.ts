import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AIClientError, type AITransport } from "@/lib/ai/client";
import type { AIRequest, ChatOutput, TradeReviewOutput } from "@/lib/ai/schemas";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import {
  effectiveAIStatus,
  runPatternDiscovery,
  runPeriodAIReview,
  runTradeAIReview,
  sendChatMessage,
  setAIEnabled,
} from "./ai";
import { syncReviews } from "./reviews";
import { addFill, closeTrade, createQuickTrade, moveToTrash, permanentlyDelete } from "./trades";

let db: JournalDb;
let repos: JournalRepositories;
let requests: AIRequest[];

beforeEach(async () => {
  db = new JournalDb(`ai-test-${newId()}`);
  repos = createDexieRepositories(db);
  requests = [];
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, timezone: "UTC", requiredFields: [] });
});

afterEach(async () => {
  await db.delete();
});

const empty = { label: "DATA_BACKED_OBSERVATION" as const, text: "Net +$500 on T0.", refs: ["T0"], evidence: "netPnl 500" };
const tradeOutput: TradeReviewOutput = {
  summary: [empty],
  ruleViolations: [],
  forecastAdherence: [],
  psychology: [],
  execution: [],
  qualityVsOutcome: [],
  similarTrades: [],
  reviewQuestions: [{ label: "REVIEW_QUESTION", text: "What made this work?", refs: [], evidence: "" }],
};

/** Records requests and answers like the real API would. */
const fake: AITransport = (async (request: AIRequest) => {
  requests.push(request);
  switch (request.task) {
    case "TRADE_REVIEW":
      return { model: "fake-model", output: tradeOutput };
    case "CHAT":
      return { model: "fake-model", output: { statements: [{ label: "INTERPRETATION", text: `Answer ${requests.length}`, refs: [], evidence: "" }] } satisfies ChatOutput };
    case "PERIOD_REVIEW":
      return {
        model: "fake-model",
        output: { overview: [], performance: [], mistakesAndRules: [], psychology: [], forecastAccuracy: [], execution: [], setups: [], marketConditions: [], reviewQuestions: [] },
      };
    case "PATTERNS":
      return { model: "fake-model", output: { patterns: [], potentialSetups: [], possibleDuplicateSetups: [], reviewQuestions: [] } };
  }
}) as AITransport;

const failing: AITransport = (async () => {
  throw new AIClientError("The AI provider is busy. Try again shortly.", "RATE_LIMITED");
}) as AITransport;

async function closedTrade(day = "2026-10-06") {
  const t = await createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: `${day}T14:00:00.000Z` });
  await addFill(repos, t.id, { type: "EXIT", price: 5010, quantity: 1, timestamp: `${day}T15:00:00.000Z`, reason: "", notes: "" });
  return closeTrade(repos, t.id);
}

describe("AI status", () => {
  it("is not configured without server credentials, otherwise follows the user's choice", async () => {
    expect(effectiveAIStatus({ configured: false, provider: null, model: null }, "ENABLED")).toBe("NOT_CONFIGURED");
    const server = { configured: true, provider: "anthropic", model: "claude-sonnet-5" };
    expect(effectiveAIStatus(server, "NOT_CONFIGURED")).toBe("CONFIGURED");
    await setAIEnabled(repos, true);
    expect(effectiveAIStatus(server, (await repos.settings.getApp()).aiStatus)).toBe("ENABLED");
  });
});

describe("trade AI review", () => {
  it("sends only this trade's context and selected screenshots, and stores the output locally", async () => {
    const trade = await closedTrade();
    const before = await repos.trades.get(trade.id);
    const screenshotId = newId();
    const review = await runTradeAIReview(repos, trade.id, fake, [
      { screenshotId, mediaType: "image/jpeg", data: "abc", caption: "Entry" },
    ]);

    expect(review).toMatchObject({ kind: "TRADE", targetId: trade.id, status: "COMPLETE", model: "fake-model", screenshotIds: [screenshotId] });
    expect(review.refs.T0).toBe(trade.id);
    const request = requests[0] as Extract<AIRequest, { task: "TRADE_REVIEW" }>;
    expect(request.images).toEqual([{ mediaType: "image/jpeg", data: "abc", caption: "Entry" }]);
    expect((request.context.trade as { ref: string }).ref).toBe("T0");
    // The AI never changes the trade.
    expect(await repos.trades.get(trade.id)).toEqual(before);
    expect(await repos.ai.listReviews(trade.id)).toHaveLength(1);
  });

  it("records a failure without affecting the trade", async () => {
    const trade = await closedTrade();
    const review = await runTradeAIReview(repos, trade.id, failing);
    expect(review).toMatchObject({ status: "FAILED", error: "The AI provider is busy. Try again shortly.", output: null });
    expect((await repos.trades.get(trade.id))!.status).toBe("CLOSED");
  });

  it("is removed when the trade is permanently deleted", async () => {
    const trade = await closedTrade();
    await runTradeAIReview(repos, trade.id, fake);
    await moveToTrash(repos, trade.id);
    await permanentlyDelete(repos, trade.id);
    expect(await repos.ai.listReviews(trade.id)).toEqual([]);
  });

  it("is only available for closed trades", async () => {
    const open = await createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: "2026-10-06T14:00:00.000Z" });
    await expect(runTradeAIReview(repos, open.id, fake)).rejects.toThrow("once a trade is closed");
  });
});

describe("periodic review and pattern discovery", () => {
  it("runs on a review's period and on the journal's closed trades", async () => {
    await closedTrade();
    const [weekly] = (await syncReviews(repos)).filter((r) => r.kind === "WEEKLY");
    const period = await runPeriodAIReview(repos, weekly!.id, fake);
    expect(period).toMatchObject({ kind: "PERIOD", targetId: weekly!.id, status: "COMPLETE" });
    expect(Object.keys(period.refs)).toEqual(["T0"]);

    const patterns = await runPatternDiscovery(repos, fake);
    expect(patterns).toMatchObject({ kind: "PATTERNS", targetId: null, status: "COMPLETE" });
    expect((await repos.ai.listReviewsByKind("PATTERNS"))[0]!.id).toBe(patterns.id);
  });
});

describe("journal chat", () => {
  it("keeps the conversation and sends history with each question", async () => {
    await closedTrade();
    const id = await sendChatMessage(repos, null, "Which setup works best?", fake);
    await sendChatMessage(repos, id, "And worst?", fake);

    const messages = await repos.ai.listMessages(id);
    expect(messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT", "USER", "ASSISTANT"]);
    expect((await repos.ai.getConversation(id))!.title).toBe("Which setup works best?");
    const second = requests[1] as Extract<AIRequest, { task: "CHAT" }>;
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second.messages.at(-1)!.text).toBe("And worst?");
  });

  it("stores an error answer when the AI fails", async () => {
    const id = await sendChatMessage(repos, null, "Hello?", failing);
    const [question, answer] = await repos.ai.listMessages(id);
    expect(question!.text).toBe("Hello?");
    expect(answer).toMatchObject({ role: "ASSISTANT", error: "The AI provider is busy. Try again shortly." });
  });
});
