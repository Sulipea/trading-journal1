/**
 * Setup management, statistics, discovery and merging (spec §16).
 *
 * Merging never rewrites history: trades keep the setup they were logged
 * with, the source setup is archived with a pointer to its target, and a
 * merge record preserves both names.
 */
import { newId, nowIso } from "@/lib/domain/ids";
import type {
  EntityId,
  RequirableField,
  Rule,
  Setup,
  SetupCategory,
  SetupMergeHistory,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import {
  findDuplicateSetups,
  suggestSetups,
  type DuplicateSuggestion,
  type SetupSuggestion,
} from "@/lib/analytics/setup-discovery";
import { groupStats, ruleStats, type GroupStats, type RuleStats, type TradeResultRow } from "@/lib/analytics/stats";
import { cleanList } from "./settings";
import { loadClosedResultRows } from "./trades";

export interface SetupInput {
  name: string;
  description: string;
  category: SetupCategory;
  tags: string[];
  requiredFields: RequirableField[];
  /** Checklist rules, in order. */
  ruleIds: EntityId[];
}

async function assertUniqueName(repos: JournalRepositories, name: string, exceptId?: EntityId) {
  const clash = (await repos.setups.list()).find(
    (s) => s.id !== exceptId && s.active && s.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (clash) throw new Error(`An active setup called "${clash.name}" already exists.`);
}

export async function createSetup(repos: JournalRepositories, input: SetupInput, now: string = nowIso()): Promise<Setup> {
  return repos.transaction(async () => {
    await assertUniqueName(repos, input.name);
    const setup: Setup = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category,
      tags: cleanList(input.tags),
      requiredFields: [...new Set(input.requiredFields)],
      active: true,
      mergedIntoId: null,
    };
    await repos.setups.save(setup);
    await repos.setups.replaceRules(setup.id, [...new Set(input.ruleIds)], now);
    return setup;
  });
}

export async function updateSetup(
  repos: JournalRepositories,
  setupId: EntityId,
  input: SetupInput,
  now: string = nowIso(),
): Promise<Setup> {
  return repos.transaction(async () => {
    const setup = await repos.setups.get(setupId);
    if (!setup) throw new Error("Setup not found.");
    if (setup.active) await assertUniqueName(repos, input.name, setupId);
    const next: Setup = {
      ...setup,
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category,
      tags: cleanList(input.tags),
      requiredFields: [...new Set(input.requiredFields)],
      updatedAt: now,
    };
    await repos.setups.save(next);
    await repos.setups.replaceRules(setupId, [...new Set(input.ruleIds)], now);
    return next;
  });
}

/** Archive (or restore) a setup. Archived setups keep their trades and stats but aren't offered for new trades. */
export async function setSetupActive(
  repos: JournalRepositories,
  setupId: EntityId,
  active: boolean,
  now: string = nowIso(),
): Promise<Setup> {
  return repos.transaction(async () => {
    const setup = await repos.setups.get(setupId);
    if (!setup) throw new Error("Setup not found.");
    if (active && setup.mergedIntoId) throw new Error("Merged setups can't be restored.");
    if (active) await assertUniqueName(repos, setup.name, setupId);
    const next = { ...setup, active, updatedAt: now };
    await repos.setups.save(next);
    return next;
  });
}

/** Delete a setup that no trade (including trashed ones) has ever used. */
export async function deleteUnusedSetup(repos: JournalRepositories, setupId: EntityId): Promise<void> {
  await repos.transaction(async () => {
    const used = (await repos.trades.list({ includeDeleted: true })).some((t) => t.setupId === setupId);
    const merged = (await repos.setups.listMergeHistory()).some(
      (m) => m.sourceSetupId === setupId || m.targetSetupId === setupId,
    );
    if (used || merged) throw new Error("This setup has history. Archive it instead of deleting it.");
    await repos.setups.delete(setupId);
  });
}

/**
 * Merge `sourceId` into `targetId`. Future trades use the target; past
 * trades keep the source, so historical analytics are unchanged.
 */
export async function mergeSetups(
  repos: JournalRepositories,
  sourceId: EntityId,
  targetId: EntityId,
  now: string = nowIso(),
): Promise<SetupMergeHistory> {
  return repos.transaction(async () => {
    if (sourceId === targetId) throw new Error("Choose two different setups to merge.");
    const [source, target] = await Promise.all([repos.setups.get(sourceId), repos.setups.get(targetId)]);
    if (!source || !target) throw new Error("Setup not found.");
    if (!target.active) throw new Error(`"${target.name}" is archived; merge into an active setup.`);
    if (source.mergedIntoId) throw new Error(`"${source.name}" was already merged.`);

    // The target gains the source's checklist rules and tags it didn't have.
    const [sourceLinks, targetLinks] = await Promise.all([
      repos.setups.listRules(sourceId),
      repos.setups.listRules(targetId),
    ]);
    const ruleIds = [...new Set([...targetLinks, ...sourceLinks].map((l) => l.ruleId))];
    await repos.setups.replaceRules(targetId, ruleIds, now);
    await repos.setups.save({ ...target, tags: cleanList([...target.tags, ...source.tags]), updatedAt: now });
    await repos.setups.save({ ...source, active: false, mergedIntoId: targetId, updatedAt: now });

    const entry: SetupMergeHistory = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      sourceSetupId: sourceId,
      targetSetupId: targetId,
      sourceName: source.name,
      targetName: target.name,
      mergedAt: now,
    };
    await repos.setups.addMergeHistory(entry);
    return entry;
  });
}

// ── reads ────────────────────────────────────────────────────────────────

export interface SetupSummary {
  setup: Setup;
  stats: GroupStats;
  mergedInto: Setup | null;
}

export interface SetupsOverview {
  setups: SetupSummary[];
  unassigned: GroupStats;
  suggestions: SetupSuggestion[];
  duplicates: DuplicateSuggestion[];
}

export async function loadSetupsOverview(repos: JournalRepositories): Promise<SetupsOverview> {
  const [setups, { rows }, settings] = await Promise.all([
    repos.setups.list(),
    loadClosedResultRows(repos),
    repos.settings.getApp(),
  ]);
  const byId = new Map(setups.map((s) => [s.id, s]));
  const rowsFor = (id: EntityId | null) => rows.filter((r) => r.trade.setupId === id);
  return {
    setups: setups.map((setup) => ({
      setup,
      stats: groupStats(rowsFor(setup.id)),
      mergedInto: setup.mergedIntoId ? (byId.get(setup.mergedIntoId) ?? null) : null,
    })),
    unassigned: groupStats(rowsFor(null)),
    suggestions: suggestSetups(rows, settings.sessions),
    duplicates: findDuplicateSetups(setups),
  };
}

export interface SetupDetail {
  setup: Setup;
  rules: Rule[];
  allRules: Rule[];
  stats: GroupStats;
  ruleStats: RuleStats[];
  /** Closed trades logged with this setup, newest first. */
  trades: TradeResultRow[];
  /** Setups merged into this one, with their own (unchanged) stats. */
  mergedFrom: { history: SetupMergeHistory; stats: GroupStats }[];
  /** Stats including setups merged into this one — computed at read time, nothing is rewritten. */
  combinedStats: GroupStats | null;
  mergedInto: Setup | null;
  /** Number of trades (any status) that use this setup. */
  usageCount: number;
}

export async function loadSetupDetail(repos: JournalRepositories, setupId: EntityId): Promise<SetupDetail> {
  const setup = await repos.setups.get(setupId);
  if (!setup) throw new Error("Setup not found.");
  const [links, allRules, results, history, allTrades] = await Promise.all([
    repos.setups.listRules(setupId),
    repos.rules.list(),
    loadClosedResultRows(repos),
    repos.setups.listMergeHistory(),
    repos.trades.list({ includeDeleted: true }),
  ]);
  const ruleById = new Map(allRules.map((r) => [r.id, r]));
  const own = results.rows.filter((r) => r.trade.setupId === setupId);
  const merges = history.filter((h) => h.targetSetupId === setupId);
  const mergedFrom = merges.map((m) => ({
    history: m,
    stats: groupStats(results.rows.filter((r) => r.trade.setupId === m.sourceSetupId)),
  }));
  const mergedIds = new Set(merges.map((m) => m.sourceSetupId));
  return {
    setup,
    rules: links.flatMap((l) => ruleById.get(l.ruleId) ?? []),
    allRules,
    stats: groupStats(own),
    ruleStats: ruleStats(results.checks, own),
    trades: [...own].sort((a, b) => (b.trade.closedAt ?? "").localeCompare(a.trade.closedAt ?? "")),
    mergedFrom,
    combinedStats:
      merges.length > 0
        ? groupStats(results.rows.filter((r) => r.trade.setupId === setupId || mergedIds.has(r.trade.setupId!)))
        : null,
    mergedInto: setup.mergedIntoId ? ((await repos.setups.get(setup.mergedIntoId)) ?? null) : null,
    usageCount: allTrades.filter((t) => t.setupId === setupId).length,
  };
}
