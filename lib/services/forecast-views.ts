/** Read models for the Forecasts pages. */
import {
  executionAgainstForecast,
  forecastAccuracy,
  forecastAnalytics,
  isDeviation,
  levelStats,
  type ExecutionAgainstForecast,
  type ForecastAccuracy,
  type ForecastAnalytics,
  type LevelTypeStats,
} from "@/lib/analytics/forecast";
import type { TradeResultRow } from "@/lib/analytics/stats";
import { isForecastLocked, latestRevision } from "@/lib/domain/forecast";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type {
  EntityId,
  Forecast,
  ForecastKeyLevel,
  ForecastRevision,
  ForecastTradeLink,
  LevelInteraction,
  MarketSnapshot,
  Setup,
  Trade,
  TradeEvent,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { calendarDay } from "./dashboard";
import { journalToday } from "./forecasts";
import { computeTradeMetrics, type TradeMetrics } from "./trade-metrics";
import { loadClosedResultRows } from "./trades";

/** Fills within this many ticks of a level count as a detected touch. */
export const TOUCH_TOLERANCE_TICKS = 2;

export interface DetectedTouch {
  levelId: EntityId;
  tradeIds: EntityId[];
}

/**
 * Automatic touch detection "where possible" (spec §23): without market data,
 * the only prices we know are your own fills, so a fill at (or within two
 * ticks of) a level on an instrument it applies to counts as a touch.
 */
export function detectTouches(
  levels: readonly ForecastKeyLevel[],
  trades: readonly Trade[],
  eventsByTrade: ReadonlyMap<EntityId, readonly TradeEvent[]>,
): DetectedTouch[] {
  const touches: DetectedTouch[] = [];
  for (const level of levels) {
    const tradeIds = trades
      .filter((t) => level.instruments.length === 0 || level.instruments.includes(t.root))
      .filter((t) => {
        const tolerance = CONTRACT_SPECS[t.root].tickSize * TOUCH_TOLERANCE_TICKS;
        const low = level.price - tolerance;
        const high = (level.priceTo ?? level.price) + tolerance;
        return (eventsByTrade.get(t.id) ?? []).some((e) => e.price >= low && e.price <= high);
      })
      .map((t) => t.id);
    if (tradeIds.length > 0) touches.push({ levelId: level.id, tradeIds });
  }
  return touches;
}

// ── overview ─────────────────────────────────────────────────────────────

export interface ForecastListItem {
  forecast: Forecast;
  active: ForecastRevision;
  revisionCount: number;
  locked: boolean;
  accuracy: ForecastAccuracy | null;
  linkedTrades: number;
  deviations: number;
}

export interface ForecastsOverview {
  today: string;
  todayForecast: Forecast | null;
  items: ForecastListItem[];
  analytics: ForecastAnalytics;
  levels: LevelTypeStats[];
  execution: ExecutionAgainstForecast;
}

export async function loadForecastsOverview(repos: JournalRepositories): Promise<ForecastsOverview> {
  const [today, forecasts, allRevisions, interactions, links, setups, results] = await Promise.all([
    journalToday(repos),
    repos.forecasts.list(),
    repos.forecasts.listAllRevisions(),
    repos.forecasts.listAllInteractions(),
    repos.forecasts.listAllLinks(),
    repos.setups.list(),
    loadClosedResultRows(repos),
  ]);
  const withRevisions = forecasts.map((forecast) => ({
    forecast,
    revisions: allRevisions.filter((r) => r.forecastId === forecast.id).sort((a, b) => a.number - b.number),
  }));
  return {
    today,
    todayForecast: forecasts.find((f) => f.date === today) ?? null,
    items: withRevisions.map(({ forecast, revisions }) => {
      const forecastLinks = links.filter((l) => l.forecastId === forecast.id);
      return {
        forecast,
        active: revisions.find((r) => r.id === forecast.activeRevisionId) ?? latestRevision(revisions)!,
        revisionCount: revisions.length - 1,
        locked: isForecastLocked(forecast, today),
        accuracy: forecast.review ? forecastAccuracy(forecast, revisions) : null,
        linkedTrades: forecastLinks.length,
        deviations: forecastLinks.filter(isDeviation).length,
      };
    }),
    analytics: forecastAnalytics(withRevisions, new Map(setups.map((s) => [s.id, s.name]))),
    levels: levelStats(withRevisions, interactions),
    execution: executionAgainstForecast(results.rows, links),
  };
}

// ── one forecast ─────────────────────────────────────────────────────────

export interface DayTrade {
  trade: Trade;
  metrics: TradeMetrics;
  link: ForecastTradeLink | null;
}

export interface ForecastWorkspace {
  today: string;
  timezone: string;
  forecast: Forecast;
  revisions: ForecastRevision[];
  /** The active (latest) revision. */
  active: ForecastRevision;
  locked: boolean;
  snapshots: MarketSnapshot[];
  interactions: LevelInteraction[];
  detectedTouches: DetectedTouch[];
  /** Trades opened on this day, plus trades from other days linked to this forecast. */
  trades: DayTrade[];
  setups: Setup[];
  accuracy: ForecastAccuracy | null;
  /** This day's closed trades against the forecast. */
  execution: ExecutionAgainstForecast;
  deviations: DayTrade[];
}

export async function loadForecastWorkspace(repos: JournalRepositories, forecastId: EntityId): Promise<ForecastWorkspace> {
  const forecast = await repos.forecasts.get(forecastId);
  if (!forecast) throw new Error("Forecast not found.");
  const [today, settings, revisions, snapshots, interactions, links, setups, allTrades, results] = await Promise.all([
    journalToday(repos),
    repos.settings.getApp(),
    repos.forecasts.listRevisions(forecastId),
    repos.forecasts.listSnapshots(forecastId),
    repos.forecasts.listInteractions(forecastId),
    repos.forecasts.listAllLinks(),
    repos.setups.list(),
    repos.trades.list(),
    loadClosedResultRows(repos),
  ]);
  const linkByTrade = new Map(links.map((l) => [l.tradeId, l]));
  const dayTrades = allTrades.filter(
    (t) =>
      calendarDay(t.openedAt, settings.timezone) === forecast.date || linkByTrade.get(t.id)?.forecastId === forecastId,
  );
  const events = await repos.tradeEvents.listForTrades(dayTrades.map((t) => t.id));
  const active = revisions.find((r) => r.id === forecast.activeRevisionId) ?? latestRevision(revisions)!;
  const trades: DayTrade[] = dayTrades.map((trade) => ({
    trade,
    metrics: computeTradeMetrics(trade, events.get(trade.id) ?? []),
    link: linkByTrade.get(trade.id) ?? null,
  }));
  const dayIds = new Set(dayTrades.map((t) => t.id));
  const dayRows: TradeResultRow[] = results.rows.filter((r) => dayIds.has(r.trade.id));

  return {
    today,
    timezone: settings.timezone,
    forecast,
    revisions,
    active,
    locked: isForecastLocked(forecast, today),
    snapshots,
    interactions,
    detectedTouches: detectTouches(active.content.keyLevels, dayTrades, events),
    trades,
    setups,
    accuracy: forecast.review ? forecastAccuracy(forecast, revisions) : null,
    execution: executionAgainstForecast(
      dayRows,
      links.filter((l) => dayIds.has(l.tradeId)),
    ),
    deviations: trades.filter((t) => t.link !== null && isDeviation(t.link)),
  };
}
