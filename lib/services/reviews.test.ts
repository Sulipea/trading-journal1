import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import {
  loadRecentFindings,
  loadReviewDetail,
  loadTradeReview,
  regenerateReview,
  saveReviewNotes,
  setFindingImportant,
  syncReviews,
} from "./reviews";
import { addFill, closeTrade, createQuickTrade, moveToTrash, savePsychology } from "./trades";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(async () => {
  db = new JournalDb(`reviews-test-${newId()}`);
  repos = createDexieRepositories(db);
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, timezone: "UTC", requiredFields: [] });
});

afterEach(async () => {
  await db.delete();
});

async function trade(day: string, exit: number, emotion?: string) {
  const t = await createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: `${day}T14:00:00.000Z` });
  if (emotion) await savePsychology(repos, t.id, "BEFORE", { emotions: [emotion], ratings: {}, text: "" });
  await addFill(repos, t.id, { type: "EXIT", price: exit, quantity: 1, timestamp: `${day}T15:00:00.000Z`, reason: "", notes: "" });
  return closeTrade(repos, t.id);
}

describe("review sync", () => {
  it("creates a weekly and a monthly review for each period with closed trades", async () => {
    await trade("2026-09-30", 5010); // week of Sep 28, September
    await trade("2026-10-02", 4990); // week of Sep 28, October
    const reviews = await syncReviews(repos);
    expect(reviews.map((r) => `${r.kind} ${r.periodStart} ${r.tradeCount} ${r.netPnl}`).sort()).toEqual([
      "MONTHLY 2026-09-01 1 500",
      "MONTHLY 2026-10-01 1 -500",
      "WEEKLY 2026-09-28 2 0",
    ]);
    // Finished periods are complete; a month that hasn't ended yet stays open.
    const today = new Date().toISOString().slice(0, 10);
    for (const r of reviews) expect(r.status).toBe(r.periodEnd < today ? "COMPLETE" : "OPEN");
  });

  it("keeps important findings across regeneration, marking them stale when the data no longer produces them", async () => {
    const loser = await trade("2026-09-30", 4990, "FOMO");
    await trade("2026-10-01", 4995, "FOMO");
    const [weekly] = (await syncReviews(repos)).filter((r) => r.kind === "WEEKLY");
    const detail = await loadReviewDetail(repos, weekly!.id);
    const fomo = detail.findings.find((f) => f.key === "psych.emotion:fomo")!;
    const summary = detail.findings.find((f) => f.key === "perf.summary")!;
    await setFindingImportant(repos, fomo, true);
    await setFindingImportant(repos, summary, true);
    await saveReviewNotes(repos, weekly!.id, "Stop chasing.");

    // The data changes: one FOMO trade goes to the trash, so the emotion finding disappears.
    await moveToTrash(repos, loser.id);
    await syncReviews(repos);
    const after = await loadReviewDetail(repos, weekly!.id);
    expect(after.review.tradeCount).toBe(1);
    expect(after.review.notes).toBe("Stop chasing.");
    expect(after.findings.find((f) => f.key === "perf.summary")).toMatchObject({ id: summary.id, important: true, stale: false });
    expect(after.findings.find((f) => f.key === "psych.emotion:fomo")).toMatchObject({ id: fomo.id, important: true, stale: true });

    // Manual regeneration behaves the same.
    await regenerateReview(repos, weekly!.id);
    expect((await loadReviewDetail(repos, weekly!.id)).findings.some((f) => f.id === fomo.id)).toBe(true);

    const recent = await loadRecentFindings(repos);
    expect(recent[0]!.finding.id).toBe(summary.id); // important, not stale, first
  });
});

describe("trade review", () => {
  it("is available once a trade is closed, with similar trades from history", async () => {
    await trade("2026-09-29", 5010, "Calm");
    await trade("2026-09-30", 5005, "Calm");
    const t = await trade("2026-10-01", 4995, "Calm");
    const review = (await loadTradeReview(repos, t.id))!;
    expect(review.similar).toHaveLength(2);
    expect(review.similar[0]!.similarities).toContain("Both felt Calm");
    expect(review.sections.find((s) => s.key === "questions")!.items[0]!.text).toContain("Similar trades usually turned out differently");

    const open = await createQuickTrade(repos, { symbol: "ESZ6", direction: "LONG", entryPrice: 5000, contracts: 1, timestamp: "2026-10-02T14:00:00.000Z" });
    expect(await loadTradeReview(repos, open.id)).toBeNull();
  });
});
