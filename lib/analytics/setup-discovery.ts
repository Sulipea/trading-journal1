/**
 * Setup discovery and duplicate detection (spec §16).
 *
 * Everything here only *suggests*: nothing is created or merged
 * automatically. Suggestions are potential patterns, not facts.
 */
import { sessionLabel } from "@/lib/domain/defaults";
import type { Direction, EntityId, InstrumentRoot, Session, SessionOption, Setup, Trade } from "@/lib/domain/types";
import { groupStats, type GroupStats, type TradeResultRow } from "./stats";

/** Minimum closed, unassigned trades sharing a pattern before suggesting a setup. */
export const MIN_DISCOVERY_TRADES = 8;

const STOP_WORDS = new Set(
  "the and for with that this from into then than they them were was are have has had not but when what where which while after before above below over under just very also only more most less some such into onto your you our out off its it's".split(
    " ",
  ),
);

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? []).filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

/** Words that appear in at least half of the texts, most common first. */
export function commonWords(texts: readonly string[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) for (const w of new Set(words(text))) counts.set(w, (counts.get(w) ?? 0) + 1);
  const threshold = Math.max(2, Math.ceil(texts.length / 2));
  return [...counts]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

export interface SetupSuggestion {
  key: string;
  name: string;
  description: string;
  root: InstrumentRoot;
  direction: Direction;
  session: Session;
  keywords: string[];
  supportingTradeIds: EntityId[];
  stats: GroupStats;
}

/**
 * Suggest potential setups from recurring patterns among closed trades
 * that have no setup: same instrument, direction and session.
 */
export function suggestSetups(
  rows: readonly TradeResultRow[],
  sessions: readonly SessionOption[] = [],
): SetupSuggestion[] {
  const groups = new Map<string, TradeResultRow[]>();
  for (const row of rows) {
    const t = row.trade;
    if (t.setupId !== null || t.session === null) continue;
    const key = `${t.root}|${t.direction}|${t.session}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const suggestions: SetupSuggestion[] = [];
  for (const [key, members] of groups) {
    if (members.length < MIN_DISCOVERY_TRADES) continue;
    const { root, direction, session } = members[0]!.trade as Trade & { session: Session };
    const keywords = commonWords(members.map((m) => `${m.trade.reasoning} ${m.trade.marketConditions}`));
    const side = direction === "LONG" ? "long" : "short";
    const label = sessionLabel(session, sessions);
    suggestions.push({
      key,
      name: `${root} ${side} · ${label}${keywords[0] ? ` · ${keywords[0]}` : ""}`,
      description:
        `${members.length} trades without a setup share this pattern: ${root} ${side}s during ${label}.` +
        (keywords.length > 0 ? ` Common words in your notes: ${keywords.join(", ")}.` : ""),
      root,
      direction,
      session,
      keywords,
      supportingTradeIds: members.map((m) => m.trade.id),
      stats: groupStats(members),
    });
  }
  return suggestions.sort((a, b) => b.supportingTradeIds.length - a.supportingTradeIds.length);
}

function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface DuplicateSuggestion {
  a: Setup;
  b: Setup;
  reasons: string[];
}

/** Pairs of active setups that look like the same thing. */
export function findDuplicateSetups(setups: readonly Setup[]): DuplicateSuggestion[] {
  const active = setups.filter((s) => s.active && s.mergedIntoId === null);
  const result: DuplicateSuggestion[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      const reasons: string[] = [];
      const na = normalizeName(a.name);
      const nb = normalizeName(b.name);
      const joinedA = na.join(" ");
      const joinedB = nb.join(" ");
      if (joinedA === joinedB) reasons.push("Same name");
      else if (joinedA.includes(joinedB) || joinedB.includes(joinedA) || jaccard(na, nb) >= 0.5) {
        reasons.push("Similar names");
      }
      const tags = (s: Setup) => s.tags.map((t) => t.toLowerCase());
      if (a.category === b.category && a.tags.length > 0 && jaccard(tags(a), tags(b)) >= 0.6) {
        reasons.push(`Same category (${a.category}) and overlapping tags`);
      }
      if (reasons.length > 0) result.push({ a, b, reasons });
    }
  }
  return result;
}

/**
 * Automatic categorization: an active setup whose name or a tag appears in
 * the trade's reasoning or market notes. Only a suggestion.
 */
export function suggestSetupForTrade(trade: Trade, setups: readonly Setup[]): Setup | null {
  if (trade.setupId !== null) return null;
  const text = ` ${`${trade.reasoning} ${trade.marketConditions}`.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  if (text.trim() === "") return null;
  const phrase = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  for (const setup of setups) {
    if (!setup.active || setup.mergedIntoId !== null) continue;
    const candidates = [setup.name, ...setup.tags].map(phrase).filter((p) => p.trim().length >= 3);
    if (candidates.some((p) => text.includes(p))) return setup;
  }
  return null;
}
