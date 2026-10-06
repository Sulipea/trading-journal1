/**
 * Rule and rule-group management (spec §17). Rules that have been used on a
 * trade are deactivated rather than deleted, so history and analytics stay intact.
 */
import { newId, nowIso } from "@/lib/domain/ids";
import type { EntityId, Rule, RuleGroup, RuleSeverity } from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { ruleStats, type RuleStats } from "@/lib/analytics/stats";
import { loadClosedResultRows } from "./trades";

export interface RuleInput {
  name: string;
  description: string;
  severity: RuleSeverity;
  groupId: EntityId | null;
  required: boolean;
  active: boolean;
  appliesTo: Rule["appliesTo"];
}

export async function createRule(repos: JournalRepositories, input: RuleInput, now: string = nowIso()): Promise<Rule> {
  const rules = await repos.rules.list();
  const rule: Rule = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    order: rules.length,
  };
  await repos.rules.save(rule);
  return rule;
}

export async function updateRule(
  repos: JournalRepositories,
  ruleId: EntityId,
  input: RuleInput,
  now: string = nowIso(),
): Promise<Rule> {
  const rule = await repos.rules.get(ruleId);
  if (!rule) throw new Error("Rule not found.");
  const next: Rule = {
    ...rule,
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    updatedAt: now,
  };
  await repos.rules.save(next);
  return next;
}

/**
 * Delete a rule that has never been used on a trade. Used rules can only be
 * deactivated. Returns "deleted" or "deactivated".
 */
export async function deleteOrDeactivateRule(
  repos: JournalRepositories,
  ruleId: EntityId,
  now: string = nowIso(),
): Promise<"deleted" | "deactivated"> {
  return repos.transaction(async () => {
    const rule = await repos.rules.get(ruleId);
    if (!rule) throw new Error("Rule not found.");
    if ((await repos.ruleChecks.countForRule(ruleId)) > 0) {
      await repos.rules.save({ ...rule, active: false, updatedAt: now });
      return "deactivated";
    }
    await repos.setups.deleteRuleLinksForRule(ruleId);
    await repos.rules.delete(ruleId);
    return "deleted";
  });
}

/** True if `candidateParentId` is `groupId` or one of its descendants. */
function wouldCycle(groups: readonly RuleGroup[], groupId: EntityId, candidateParentId: EntityId | null): boolean {
  let current = candidateParentId;
  const byId = new Map(groups.map((g) => [g.id, g]));
  while (current !== null) {
    if (current === groupId) return true;
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

export async function saveRuleGroup(
  repos: JournalRepositories,
  input: { id?: EntityId; name: string; parentId: EntityId | null },
  now: string = nowIso(),
): Promise<RuleGroup> {
  const groups = await repos.rules.listGroups();
  const existing = input.id ? groups.find((g) => g.id === input.id) : undefined;
  if (input.id && !existing) throw new Error("Group not found.");
  if (existing && wouldCycle(groups, existing.id, input.parentId)) {
    throw new Error("A group can't be placed inside itself.");
  }
  if (input.parentId && !groups.some((g) => g.id === input.parentId)) throw new Error("Parent group not found.");
  const group: RuleGroup = existing
    ? { ...existing, name: input.name.trim(), parentId: input.parentId, updatedAt: now }
    : {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        name: input.name.trim(),
        parentId: input.parentId,
        order: groups.length,
      };
  await repos.rules.saveGroup(group);
  return group;
}

/** Delete a group; its rules and sub-groups move up to its parent. */
export async function deleteRuleGroup(repos: JournalRepositories, groupId: EntityId, now: string = nowIso()) {
  await repos.transaction(async () => {
    const groups = await repos.rules.listGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    for (const child of groups.filter((g) => g.parentId === groupId)) {
      await repos.rules.saveGroup({ ...child, parentId: group.parentId, updatedAt: now });
    }
    for (const rule of (await repos.rules.list()).filter((r) => r.groupId === groupId)) {
      await repos.rules.save({ ...rule, groupId: group.parentId, updatedAt: now });
    }
    await repos.rules.deleteGroup(groupId);
  });
}

export interface RuleTreeNode {
  group: RuleGroup | null;
  depth: number;
  rules: Rule[];
  children: RuleTreeNode[];
}

/** Rules arranged in their group hierarchy; ungrouped rules sit at the root. */
export function buildRuleTree(rules: readonly Rule[], groups: readonly RuleGroup[]): RuleTreeNode {
  const build = (group: RuleGroup | null, depth: number): RuleTreeNode => ({
    group,
    depth,
    rules: rules.filter((r) => r.groupId === (group?.id ?? null)),
    children: groups.filter((g) => g.parentId === (group?.id ?? null)).map((g) => build(g, depth + 1)),
  });
  return build(null, -1);
}

export interface RulesOverview {
  rules: Rule[];
  groups: RuleGroup[];
  stats: RuleStats[];
  closedTradeCount: number;
}

export async function loadRulesOverview(repos: JournalRepositories): Promise<RulesOverview> {
  const [rules, groups, results] = await Promise.all([
    repos.rules.list(),
    repos.rules.listGroups(),
    loadClosedResultRows(repos),
  ]);
  return { rules, groups, stats: ruleStats(results.checks, results.rows), closedTradeCount: results.rows.length };
}
