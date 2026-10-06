import { describe, expect, it } from "vitest";
import { computeTradeQuality } from "@/lib/calculations/quality";
import { DEFAULT_SESSIONS } from "@/lib/domain/defaults";
import { newId } from "@/lib/domain/ids";
import type { PsychologyEntry } from "@/lib/domain/types";
import { makeTrade } from "@/lib/test/fixtures";
import { DIMENSION_LABELS, breakdown, type Dimension } from "./breakdowns";
import { buildAnalyticsRows } from "./dataset";
import { DEFAULT_FILTER, applyFilter } from "./filters";
import { detectPatterns } from "./patterns";
import { emotionFrequency, ratingsVsOutcome } from "./psychology";
import { groupStats, type TradeResultRow } from "./stats";

/** Spec §38: analytics must stay responsive for several years of trades. */
describe("analytics performance", () => {
  it("builds rows, breakdowns and patterns for 5,000 trades quickly", () => {
    const EMOTIONS = ["Calm", "Focused", "Anxious", "FOMO", "Bored"];
    const sessions = DEFAULT_SESSIONS.map((s) => s.id);
    const results: TradeResultRow[] = [];
    const psychology: PsychologyEntry[] = [];
    for (let i = 0; i < 5_000; i++) {
      const openedAt = new Date(Date.UTC(2023, 0, 2) + i * 5 * 3_600_000).toISOString();
      const trade = makeTrade({
        status: "CLOSED",
        openedAt,
        closedAt: openedAt,
        direction: i % 3 === 0 ? "SHORT" : "LONG",
        session: sessions[i % sessions.length]!,
      });
      const netPnl = ((i * 7919) % 900) - 400;
      results.push({
        trade,
        netPnl,
        rMultiple: netPnl / 200,
        quality: computeTradeQuality({
          checks: [],
          overrideCount: 0,
          executionRating: (i % 5) + 1,
          plannedStop: null,
          plannedRisk: null,
          actualRisk: null,
          plannedContracts: 1,
          maxOpenQuantity: null,
          rMultiple: netPnl / 200,
          netPnl,
        }),
      });
      psychology.push({
        id: newId(),
        createdAt: openedAt,
        updatedAt: openedAt,
        tradeId: trade.id,
        phase: "BEFORE",
        emotions: [EMOTIONS[i % EMOTIONS.length]!, EMOTIONS[(i * 3) % EMOTIONS.length]!],
        ratings: { Focus: (i % 5) + 1 },
        text: "",
      });
    }

    const started = performance.now();
    const rows = buildAnalyticsRows(results, {
      timezone: "America/New_York",
      sessions: DEFAULT_SESSIONS,
      setups: [],
      psychology,
      checks: [],
      links: [],
      revisions: [],
    });
    applyFilter(rows, { ...DEFAULT_FILTER, direction: "LONG" }, "2026-10-06");
    groupStats(rows);
    for (const dimension of Object.keys(DIMENSION_LABELS) as Dimension[]) breakdown(rows, dimension);
    emotionFrequency(rows, Map.groupBy(psychology, (p) => p.tradeId));
    ratingsVsOutcome(rows);
    detectPatterns(rows);
    const elapsed = performance.now() - started;

    expect(rows).toHaveLength(5_000);
    expect(elapsed).toBeLessThan(1_000);
  });
});
