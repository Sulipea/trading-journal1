/**
 * A trade's setup, skipped setup requirements, rules checklist and review
 * flag (spec §6, §16, §17).
 */
import { SEVERITY_POLICY, applicableRules, violationIssues } from "@/lib/domain/checklist";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import { newId, nowIso } from "@/lib/domain/ids";
import type { EntityId, RequirableField, RuleCheck, RuleCheckStatus, Trade } from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { TradeServiceError, assertStillComplete, change, loadActiveTrade } from "./trades";

function touched(trade: Trade, now: string): Trade {
  return { ...trade, status: trade.status === "OPEN" ? "UPDATED" : trade.status, updatedAt: now };
}

/** Choose (or clear) the trade's setup. Skipped requirements belong to the old setup and are dropped. */
export async function setTradeSetup(
  repos: JournalRepositories,
  tradeId: EntityId,
  setupId: EntityId | null,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    if (trade.setupId === setupId) return trade;
    if (setupId !== null) {
      const setup = await repos.setups.get(setupId);
      if (!setup) throw new TradeServiceError("Setup not found.", "NOT_FOUND");
      if (!setup.active) throw new Error(`"${setup.name}" is archived and can't be used for trades.`);
    }
    const next: Trade = { ...touched(trade, now), setupId, requirementOverrides: [] };
    await assertStillComplete(repos, next);
    await repos.trades.save(next);
    await repos.changeHistory.add([change(trade, "setupId", trade.setupId, setupId, now)]);
    return next;
  });
}

/**
 * Skip a setup requirement on purpose (spec §6). Requires a reason and is
 * tracked as a process violation. Globally required fields can't be skipped.
 */
export async function skipRequirement(
  repos: JournalRepositories,
  tradeId: EntityId,
  field: RequirableField,
  reason: string,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    if (!reason.trim()) throw new Error("Explain why you are skipping this requirement.");
    const [settings, setup] = await Promise.all([
      repos.settings.getApp(),
      trade.setupId ? repos.setups.get(trade.setupId) : Promise.resolve(undefined),
    ]);
    if (settings.requiredFields.includes(field)) {
      throw new Error(`${REQUIRABLE_FIELD_LABELS[field]} is required for every trade and can't be skipped.`);
    }
    if (!setup?.requiredFields.includes(field)) {
      throw new Error(`${REQUIRABLE_FIELD_LABELS[field]} isn't a requirement of this trade's setup.`);
    }
    const next: Trade = {
      ...touched(trade, now),
      requirementOverrides: [
        ...trade.requirementOverrides.filter((o) => o.field !== field),
        { field, reason: reason.trim(), at: now },
      ],
    };
    await repos.trades.save(next);
    await repos.changeHistory.add([change(trade, `requirement.skipped`, null, { field, reason: reason.trim() }, now)]);
    return next;
  });
}

export async function unskipRequirement(
  repos: JournalRepositories,
  tradeId: EntityId,
  field: RequirableField,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const existing = trade.requirementOverrides.find((o) => o.field === field);
    if (!existing) return trade;
    const next: Trade = {
      ...touched(trade, now),
      requirementOverrides: trade.requirementOverrides.filter((o) => o.field !== field),
    };
    await assertStillComplete(repos, next);
    await repos.trades.save(next);
    await repos.changeHistory.add([change(trade, `requirement.restored`, existing, null, now)]);
    return next;
  });
}

export interface RuleCheckInput {
  status: RuleCheckStatus;
  acknowledged: boolean;
  reason: string;
}

/**
 * Answer one checklist rule. Violations must meet their severity's demands
 * before they can be saved; a high-severity violation flags the trade for review.
 */
export async function saveRuleCheck(
  repos: JournalRepositories,
  tradeId: EntityId,
  ruleId: EntityId,
  input: RuleCheckInput,
  now: string = nowIso(),
): Promise<RuleCheck> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const [rule, allRules, links, checks] = await Promise.all([
      repos.rules.get(ruleId),
      repos.rules.list(),
      trade.setupId ? repos.setups.listRules(trade.setupId) : Promise.resolve([]),
      repos.ruleChecks.listForTrade(tradeId),
    ]);
    if (!rule) throw new TradeServiceError("Rule not found.", "NOT_FOUND");
    if (!applicableRules(allRules, trade.setupId, links, checks).some((r) => r.id === ruleId)) {
      throw new Error(`"${rule.name}" is not on this trade's checklist.`);
    }

    const existing = checks.find((c) => c.ruleId === ruleId);
    const reason = input.reason.trim();
    const violated = input.status === "VIOLATED";
    if (violated) {
      const issues = violationIssues(rule.severity, { acknowledged: input.acknowledged, reason });
      if (issues.includes("NEEDS_ACKNOWLEDGMENT")) {
        throw new Error(`Acknowledge the violation of "${rule.name}" to save it.`);
      }
      if (issues.includes("NEEDS_REASON")) {
        throw new Error(`Explain why "${rule.name}" was violated — it's a high-severity rule.`);
      }
    }

    const check: RuleCheck = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      tradeId,
      ruleId,
      ruleName: rule.name,
      severity: rule.severity,
      status: input.status,
      acknowledged: violated && input.acknowledged,
      reason: violated ? reason : "",
    };

    const flag = violated && SEVERITY_POLICY[rule.severity].flagForReview;
    const next: Trade = { ...touched(trade, now), flaggedForReview: trade.flaggedForReview || flag };
    await repos.ruleChecks.save(check);
    await repos.trades.save(next);
    await repos.changeHistory.add([
      change(
        trade,
        `rule.${rule.name}`,
        existing ? existing.status : null,
        violated ? { status: "VIOLATED", reason } : "FOLLOWED",
        now,
      ),
      ...(flag && !trade.flaggedForReview ? [change(trade, "flaggedForReview", false, true, now)] : []),
    ]);
    return check;
  });
}

/** Remove the answer for one rule. */
export async function clearRuleCheck(
  repos: JournalRepositories,
  tradeId: EntityId,
  ruleId: EntityId,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const checks = await repos.ruleChecks.listForTrade(tradeId);
    const existing = checks.find((c) => c.ruleId === ruleId);
    if (!existing) return;
    await assertStillComplete(repos, trade, { ruleChecks: checks.filter((c) => c.id !== existing.id) });
    await repos.ruleChecks.delete(existing.id);
    await repos.trades.save(touched(trade, now));
    await repos.changeHistory.add([change(trade, `rule.${existing.ruleName}`, existing.status, null, now)]);
  });
}

/** Flag or clear the trade's review flag by hand. */
export async function setReviewFlag(
  repos: JournalRepositories,
  tradeId: EntityId,
  flagged: boolean,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    if (trade.flaggedForReview === flagged) return trade;
    const next: Trade = { ...trade, flaggedForReview: flagged, updatedAt: now };
    await repos.trades.save(next);
    await repos.changeHistory.add([change(trade, "flaggedForReview", trade.flaggedForReview, flagged, now)]);
    return next;
  });
}
