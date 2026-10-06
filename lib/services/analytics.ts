/** Loads everything the Analytics and Calendar pages compute from. */
import { buildAnalyticsRows, type AnalyticsRow } from "@/lib/analytics/dataset";
import type { PsychologyPhase, SessionOption, Setup } from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { journalToday } from "./forecasts";
import { loadClosedResultRows } from "./trades";

export interface AnalyticsDataset {
  rows: AnalyticsRow[];
  /** Psychology entries of closed trades, by trade id (for per-phase emotion counts). */
  psychologyByTrade: Map<string, { phase: PsychologyPhase; emotions: string[] }[]>;
  startingBalance: number;
  today: string;
  timezone: string;
  setups: Setup[];
  sessions: SessionOption[];
  /** Emotions offered in filters: configured ones plus any used on trades. */
  emotions: string[];
}

export async function loadAnalyticsDataset(repos: JournalRepositories): Promise<AnalyticsDataset> {
  const [results, account, settings, setups, psychology, links, revisions, today] = await Promise.all([
    loadClosedResultRows(repos),
    repos.settings.getAccount(),
    repos.settings.getApp(),
    repos.setups.list(),
    repos.psychology.listAll(),
    repos.forecasts.listAllLinks(),
    repos.forecasts.listAllRevisions(),
    journalToday(repos),
  ]);
  const closedIds = new Set(results.rows.map((r) => r.trade.id));
  const closedPsychology = psychology.filter((p) => closedIds.has(p.tradeId));
  const rows = buildAnalyticsRows(results.rows, {
    timezone: settings.timezone,
    sessions: settings.sessions,
    setups,
    psychology: closedPsychology,
    checks: results.checks,
    links,
    revisions,
  });

  const psychologyByTrade = new Map<string, { phase: PsychologyPhase; emotions: string[] }[]>();
  for (const p of closedPsychology) {
    psychologyByTrade.set(p.tradeId, [...(psychologyByTrade.get(p.tradeId) ?? []), { phase: p.phase, emotions: p.emotions }]);
  }
  const used = rows.flatMap((r) => r.emotions);
  const emotions = [...settings.psychologyEmotions];
  for (const e of used) if (!emotions.some((x) => x.toLowerCase() === e.toLowerCase())) emotions.push(e);

  return {
    rows,
    psychologyByTrade,
    startingBalance: account.startingBalance,
    today,
    timezone: settings.timezone,
    setups,
    sessions: settings.sessions,
    emotions,
  };
}
