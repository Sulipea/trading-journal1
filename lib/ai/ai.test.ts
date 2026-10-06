import { describe, expect, it } from "vitest";
import { computeTradeQuality } from "@/lib/calculations/quality";
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { newId } from "@/lib/domain/ids";
import { makeTrade } from "@/lib/test/fixtures";
import { TradeRefs, buildChatContext, compactTrade } from "./context-builder";
import { systemPrompt } from "./prompts";
import { aiRequestSchema, checkStatements } from "./schemas";

const row = (netPnl: number, reasoning = "secret reasoning text"): AnalyticsRow => ({
  trade: makeTrade({ status: "CLOSED", closedAt: "2026-10-06T15:00:00.000Z", reasoning, notes: "private note" }),
  netPnl,
  rMultiple: 1,
  quality: computeTradeQuality({
    checks: [],
    overrideCount: 0,
    executionRating: 4,
    plannedStop: 4995,
    plannedRisk: 250,
    actualRisk: 250,
    plannedContracts: 1,
    maxOpenQuantity: 1,
    rMultiple: 1,
    netPnl,
  }),
  day: "2026-10-06",
  hour: 9,
  weekday: 1,
  setupName: null,
  sessionLabel: null,
  emotions: ["Calm"],
  ratings: {},
  ruleChecks: 0,
  violations: 0,
  ruleAdherence: "UNCHECKED",
  forecastAdherence: "UNLINKED",
  conditionTags: [],
});

describe("checkStatements", () => {
  it("drops unknown trade references and downgrades unsupported data claims", () => {
    const checked = checkStatements(
      [
        { label: "DATA_BACKED_OBSERVATION", text: "Supported", refs: ["T1", "T9"], evidence: "net -$200" },
        { label: "POSSIBLE_PATTERN", text: "Unsupported", refs: ["T9"], evidence: " " },
        { label: "REVIEW_QUESTION", text: "Why?", refs: [], evidence: "" },
      ],
      new Set(["T0", "T1"]),
    );
    expect(checked[0]).toMatchObject({ label: "DATA_BACKED_OBSERVATION", refs: ["T1"], unknownRefs: ["T9"], downgraded: false });
    expect(checked[1]).toMatchObject({ label: "INTERPRETATION", refs: [], downgraded: true });
    expect(checked[2]).toMatchObject({ label: "REVIEW_QUESTION", downgraded: false });
  });
});

describe("context builder", () => {
  it("assigns stable short references", () => {
    const refs = new TradeRefs();
    const a = newId();
    const b = newId();
    expect([refs.ref(a), refs.ref(b), refs.ref(a)]).toEqual(["T0", "T1", "T0"]);
    expect(refs.toRecord()).toEqual({ T0: a, T1: b });
  });

  it("sends compact rows without free text, and only recent trades to chat", () => {
    const compact = compactTrade(row(100), "T0");
    expect(JSON.stringify(compact)).not.toContain("secret reasoning text");
    expect(JSON.stringify(compact)).not.toContain("private note");

    const rows = Array.from({ length: 80 }, (_, i) => row(i));
    const { context, refs } = buildChatContext({ rows, setups: [], rules: [], patterns: [], startingBalance: 10_000, today: "2026-10-06" });
    expect(context.recentTrades).toHaveLength(60);
    expect(Object.keys(refs)).toHaveLength(60);
    expect(context.allClosedTrades.trades).toBe(80);
    expect(JSON.stringify(context)).not.toContain("secret reasoning text");
  });
});

describe("prompts and requests", () => {
  it("forbids trading decisions and requires labelled, cited statements", () => {
    for (const task of ["TRADE_REVIEW", "PERIOD_REVIEW", "PATTERNS", "CHAT"] as const) {
      const prompt = systemPrompt(task);
      expect(prompt).toContain("You never make trading decisions");
      expect(prompt).toContain("DATA_BACKED_OBSERVATION");
      expect(prompt).toContain("Never present a correlation as a cause");
    }
  });

  it("limits screenshots per request and rejects malformed requests", () => {
    const image = { mediaType: "image/jpeg", data: "abc", caption: "" };
    expect(aiRequestSchema.safeParse({ task: "TRADE_REVIEW", context: {}, images: [image] }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ task: "TRADE_REVIEW", context: {}, images: Array(5).fill(image) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ task: "CHAT", context: {}, messages: [] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ task: "DELETE_EVERYTHING", context: {} }).success).toBe(false);
  });
});
