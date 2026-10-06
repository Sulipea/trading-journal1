import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import type { Setup, Trade } from "@/lib/domain/types";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import { createRule, deleteOrDeactivateRule, deleteRuleGroup, saveRuleGroup, loadRulesOverview, type RuleInput } from "./rules";
import {
  createSetup,
  deleteUnusedSetup,
  loadSetupDetail,
  loadSetupsOverview,
  mergeSetups,
  setSetupActive,
  type SetupInput,
} from "./setups";
import { saveRuleCheck, setReviewFlag, setTradeSetup, skipRequirement, unskipRequirement } from "./trade-rules";
import { addFill, closeTrade, createQuickTrade, loadTradeWorkspace, updateTrade } from "./trades";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(async () => {
  db = new JournalDb(`rules-test-${newId()}`);
  repos = createDexieRepositories(db);
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, requiredFields: [] });
});

afterEach(async () => {
  await db.delete();
});

const ruleInput = (name: string, overrides: Partial<RuleInput> = {}): RuleInput => ({
  name,
  description: "",
  severity: "MEDIUM",
  groupId: null,
  required: false,
  active: true,
  appliesTo: "ALL",
  ...overrides,
});

const setupInput = (name: string, overrides: Partial<SetupInput> = {}): SetupInput => ({
  name,
  description: "",
  category: "Breakout",
  tags: [],
  requiredFields: [],
  ruleIds: [],
  ...overrides,
});

let minute = 0;
async function flatTrade(exitPrice = 5010, setupId: string | null = null): Promise<Trade> {
  const t0 = new Date(Date.UTC(2026, 9, 6, 14, minute++)).toISOString();
  const trade = await createQuickTrade(repos, {
    symbol: "ESZ6",
    direction: "LONG",
    entryPrice: 5000,
    contracts: 1,
    timestamp: t0,
  });
  await addFill(repos, trade.id, {
    type: "EXIT",
    price: exitPrice,
    quantity: 1,
    timestamp: new Date(Date.parse(t0) + 30_000).toISOString(),
    reason: "",
    notes: "",
  });
  await updateTrade(repos, trade.id, { plannedStop: 4995 });
  if (setupId) await setTradeSetup(repos, trade.id, setupId);
  return (await repos.trades.get(trade.id))!;
}

describe("rule violations", () => {
  it("enforces severity requirements before saving a violation", async () => {
    const low = await createRule(repos, ruleInput("Low", { severity: "LOW" }));
    const medium = await createRule(repos, ruleInput("Medium"));
    const high = await createRule(repos, ruleInput("High", { severity: "HIGH" }));
    const trade = await flatTrade();

    await saveRuleCheck(repos, trade.id, low.id, { status: "VIOLATED", acknowledged: false, reason: "" });
    await expect(
      saveRuleCheck(repos, trade.id, medium.id, { status: "VIOLATED", acknowledged: false, reason: "" }),
    ).rejects.toThrow("Acknowledge");
    await expect(
      saveRuleCheck(repos, trade.id, high.id, { status: "VIOLATED", acknowledged: true, reason: "" }),
    ).rejects.toThrow("Explain");

    expect((await repos.trades.get(trade.id))!.flaggedForReview).toBe(false);
    await saveRuleCheck(repos, trade.id, high.id, { status: "VIOLATED", acknowledged: true, reason: "FOMO" });
    expect((await repos.trades.get(trade.id))!.flaggedForReview).toBe(true);

    await setReviewFlag(repos, trade.id, false);
    expect((await repos.trades.get(trade.id))!.flaggedForReview).toBe(false);
  });

  it("snapshots the rule name and severity on the check", async () => {
    const rule = await createRule(repos, ruleInput("Wait for close", { severity: "LOW" }));
    const trade = await flatTrade();
    const check = await saveRuleCheck(repos, trade.id, rule.id, { status: "FOLLOWED", acknowledged: false, reason: "" });
    await repos.rules.save({ ...rule, name: "Renamed", severity: "HIGH" });
    expect((await repos.ruleChecks.listForTrade(trade.id))[0]).toMatchObject({
      id: check.id,
      ruleName: "Wait for close",
      severity: "LOW",
    });
  });

  it("blocks closing until required rules are answered", async () => {
    const required = await createRule(repos, ruleInput("Required", { required: true }));
    await createRule(repos, ruleInput("Optional"));
    const trade = await flatTrade();

    await expect(closeTrade(repos, trade.id)).rejects.toThrow("Required");
    await saveRuleCheck(repos, trade.id, required.id, { status: "FOLLOWED", acknowledged: false, reason: "" });
    expect((await closeTrade(repos, trade.id)).status).toBe("CLOSED");
  });

  it("only offers setup-scoped rules when the setup is chosen", async () => {
    const scoped = await createRule(repos, ruleInput("Retest entry", { appliesTo: "SETUPS" }));
    const setup = await createSetup(repos, setupInput("ORB", { ruleIds: [scoped.id] }));
    const trade = await flatTrade();

    expect((await loadTradeWorkspace(repos, trade.id)).rules).toEqual([]);
    await expect(
      saveRuleCheck(repos, trade.id, scoped.id, { status: "FOLLOWED", acknowledged: false, reason: "" }),
    ).rejects.toThrow("not on this trade's checklist");

    await setTradeSetup(repos, trade.id, setup.id);
    expect((await loadTradeWorkspace(repos, trade.id)).rules.map((r) => r.name)).toEqual(["Retest entry"]);
  });

  it("deactivates used rules instead of deleting them", async () => {
    const used = await createRule(repos, ruleInput("Used"));
    const unused = await createRule(repos, ruleInput("Unused"));
    const trade = await flatTrade();
    await saveRuleCheck(repos, trade.id, used.id, { status: "FOLLOWED", acknowledged: false, reason: "" });

    expect(await deleteOrDeactivateRule(repos, used.id)).toBe("deactivated");
    expect((await repos.rules.get(used.id))!.active).toBe(false);
    expect(await deleteOrDeactivateRule(repos, unused.id)).toBe("deleted");
    expect(await repos.rules.get(unused.id)).toBeUndefined();
  });
});

describe("rule groups", () => {
  it("nests groups, prevents cycles, and moves contents up on delete", async () => {
    const parent = await saveRuleGroup(repos, { name: "Risk", parentId: null });
    const child = await saveRuleGroup(repos, { name: "Sizing", parentId: parent.id });
    await expect(saveRuleGroup(repos, { id: parent.id, name: "Risk", parentId: child.id })).rejects.toThrow("inside itself");

    const rule = await createRule(repos, ruleInput("Max 2 contracts", { groupId: child.id }));
    await deleteRuleGroup(repos, child.id);
    expect((await repos.rules.get(rule.id))!.groupId).toBe(parent.id);
  });
});

describe("setup requirements", () => {
  it("requires setup fields to close unless skipped with a reason, which costs quality", async () => {
    const setup = await createSetup(repos, setupInput("Breakout", { requiredFields: ["session"] }));
    const trade = await flatTrade(5010, setup.id);

    await expect(closeTrade(repos, trade.id)).rejects.toThrow("required fields");
    await expect(skipRequirement(repos, trade.id, "session", "  ")).rejects.toThrow("Explain");
    await skipRequirement(repos, trade.id, "session", "Overnight trade, no clear session");

    const ws = await loadTradeWorkspace(repos, trade.id);
    expect(ws.readiness.missing).toEqual([]);
    expect(ws.quality.components.rules).toBe(75); // one override = medium penalty
    await closeTrade(repos, trade.id);
  });

  it("can't skip globally required fields or fields the setup doesn't require", async () => {
    const settings = await repos.settings.getApp();
    await repos.settings.saveApp({ ...settings, requiredFields: ["reasoning"] });
    const setup = await createSetup(repos, setupInput("Pullback", { requiredFields: ["reasoning", "session"] }));
    const trade = await flatTrade(5010, setup.id);

    await expect(skipRequirement(repos, trade.id, "reasoning", "x")).rejects.toThrow("every trade");
    await expect(skipRequirement(repos, trade.id, "notes", "x")).rejects.toThrow("isn't a requirement");
    await skipRequirement(repos, trade.id, "session", "x");
    await unskipRequirement(repos, trade.id, "session");
    expect((await repos.trades.get(trade.id))!.requirementOverrides).toEqual([]);
  });

  it("drops skipped requirements when the setup changes, and rejects archived setups", async () => {
    const a = await createSetup(repos, setupInput("A", { requiredFields: ["session"] }));
    const b = await createSetup(repos, setupInput("B"));
    const trade = await flatTrade(5010, a.id);
    await skipRequirement(repos, trade.id, "session", "x");
    await setTradeSetup(repos, trade.id, b.id);
    expect((await repos.trades.get(trade.id))!.requirementOverrides).toEqual([]);

    await setSetupActive(repos, a.id, false);
    await expect(setTradeSetup(repos, trade.id, a.id)).rejects.toThrow("archived");
  });
});

describe("setups", () => {
  it("rejects duplicate active names and only deletes unused setups", async () => {
    const setup = await createSetup(repos, setupInput("VWAP reclaim"));
    await expect(createSetup(repos, setupInput("vwap RECLAIM"))).rejects.toThrow("already exists");

    await flatTrade(5010, setup.id);
    await expect(deleteUnusedSetup(repos, setup.id)).rejects.toThrow("Archive");
    const unused = await createSetup(repos, setupInput("Unused"));
    await deleteUnusedSetup(repos, unused.id);
    expect(await repos.setups.get(unused.id)).toBeUndefined();
  });

  it("merges without rewriting history", async () => {
    const ruleA = await createRule(repos, ruleInput("Rule A", { appliesTo: "SETUPS" }));
    const source = await createSetup(repos, setupInput("ORB", { tags: ["open"], ruleIds: [ruleA.id] }));
    const target = await createSetup(repos, setupInput("Opening range breakout"));
    const old = await flatTrade(5010, source.id);
    await closeTrade(repos, old.id);
    const kept = await flatTrade(4995, target.id);
    await closeTrade(repos, kept.id);

    const before = await loadSetupsOverview(repos);
    expect(before.duplicates).toHaveLength(0);

    await mergeSetups(repos, source.id, target.id);

    // Historical trade keeps its original setup; source is archived and points at the target.
    expect((await repos.trades.get(old.id))!.setupId).toBe(source.id);
    const archived = (await repos.setups.get(source.id))!;
    expect(archived).toMatchObject({ active: false, mergedIntoId: target.id, name: "ORB" });
    await expect(setTradeSetup(repos, (await flatTrade()).id, source.id)).rejects.toThrow("archived");

    // Source stats are unchanged; target shows its own and a combined view.
    const after = await loadSetupsOverview(repos);
    const stats = (id: string) => after.setups.find((s) => s.setup.id === id)!.stats;
    expect(stats(source.id).netPnl).toBe(500);
    expect(stats(target.id).netPnl).toBe(-250);

    const detail = await loadSetupDetail(repos, target.id);
    expect(detail.combinedStats?.netPnl).toBe(250);
    expect(detail.mergedFrom[0]!.history).toMatchObject({ sourceName: "ORB", targetName: "Opening range breakout" });
    expect(detail.rules.map((r) => r.name)).toEqual(["Rule A"]);
    expect(detail.setup.tags).toEqual(["open"]);
  });
});

describe("analytics", () => {
  it("compares following vs violating results per rule", async () => {
    const rule = await createRule(repos, ruleInput("No chasing", { severity: "LOW" }));
    const follow = await flatTrade(5010);
    await saveRuleCheck(repos, follow.id, rule.id, { status: "FOLLOWED", acknowledged: false, reason: "" });
    await closeTrade(repos, follow.id);
    const violate = await flatTrade(4990);
    await saveRuleCheck(repos, violate.id, rule.id, { status: "VIOLATED", acknowledged: false, reason: "" });
    await closeTrade(repos, violate.id);

    const { stats } = await loadRulesOverview(repos);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ ruleName: "No chasing", checked: 2, violations: 1, violationRate: 0.5 });
    expect(stats[0]!.following.netPnl).toBe(500);
    expect(stats[0]!.violating.netPnl).toBe(-500);
    expect(stats[0]!.violating.smallSample).toBe(true);
  });

  it("suggests a setup from recurring unassigned trades, and suggests setups for trades by their notes", async () => {
    for (let i = 0; i < 8; i++) {
      const t = await flatTrade(i % 2 ? 5010 : 4995);
      await updateTrade(repos, t.id, { session: "NY_AM", reasoning: "Opening drive above VWAP" });
      await closeTrade(repos, t.id);
    }
    const { suggestions } = await loadSetupsOverview(repos);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.supportingTradeIds).toHaveLength(8);
    expect(suggestions[0]!.keywords).toEqual(expect.arrayContaining(["opening", "drive", "vwap"]));
    expect(suggestions[0]!.stats.count).toBe(8);
    // Nothing is created automatically.
    expect(await repos.setups.list()).toEqual([]);

    const setup: Setup = await createSetup(repos, setupInput("Opening drive"));
    const fresh = await flatTrade();
    await updateTrade(repos, fresh.id, { reasoning: "Classic opening drive" });
    expect((await loadTradeWorkspace(repos, fresh.id)).suggestedSetup?.id).toBe(setup.id);
  });

  it("flags likely duplicate setups", async () => {
    await createSetup(repos, setupInput("VWAP reclaim long"));
    await createSetup(repos, setupInput("VWAP reclaim"));
    await createSetup(repos, setupInput("Fade highs", { category: "Reversal" }));
    const { duplicates } = await loadSetupsOverview(repos);
    expect(duplicates.map((d) => [d.a.name, d.b.name].sort())).toEqual([["VWAP reclaim", "VWAP reclaim long"]]);
  });
});

