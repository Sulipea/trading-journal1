/**
 * Forecast-to-trade workflow (spec §27): every trade links to one forecast
 * and one scenario, or is marked Unplanned with a reason. Partially/No
 * answers need a reason and count as deviations. A trade is judged against
 * the revision that was active when it was opened.
 */
import { directionMatchesBias, latestRevision, revisionActiveAt } from "@/lib/domain/forecast";
import { newId, nowIso } from "@/lib/domain/ids";
import type {
  EntityId,
  Forecast,
  ForecastAdherence,
  ForecastRevision,
  ForecastScenario,
  ForecastTradeLink,
  Trade,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { calendarDay } from "./dashboard";
import { assertStillComplete, change, loadActiveTrade } from "./trades";

export type ForecastLinkInput =
  | {
      planned: true;
      forecastId: EntityId;
      scenarioId: EntityId;
      adherence: ForecastAdherence;
      reason: string;
    }
  | { planned: false; reason: string };

/** Scenarios a trade can link to: from the revision active at entry, else the latest. */
export function linkableRevision(revisions: readonly ForecastRevision[], openedAt: string): ForecastRevision | null {
  return revisionActiveAt(revisions, openedAt) ?? latestRevision(revisions);
}

export async function setForecastLink(
  repos: JournalRepositories,
  tradeId: EntityId,
  input: ForecastLinkInput,
  now: string = nowIso(),
): Promise<ForecastTradeLink> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const existing = await repos.forecasts.getLinkForTrade(tradeId);
    const reason = input.reason.trim();
    let link: ForecastTradeLink;

    if (input.planned) {
      const forecast = await repos.forecasts.get(input.forecastId);
      if (!forecast) throw new Error("Forecast not found.");
      const revisions = await repos.forecasts.listRevisions(forecast.id);
      const revision = linkableRevision(revisions, trade.openedAt);
      if (!revision?.content.scenarios.some((s) => s.id === input.scenarioId)) {
        throw new Error("Choose a scenario from this forecast.");
      }
      if (input.adherence !== "YES" && !reason) {
        throw new Error("Explain how the trade differed from the forecast.");
      }
      link = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        tradeId,
        planned: true,
        forecastId: forecast.id,
        scenarioId: input.scenarioId,
        revisionIdAtEntry: revisionActiveAt(revisions, trade.openedAt)?.id ?? null,
        adherence: input.adherence,
        reason,
      };
    } else {
      if (!reason) throw new Error("Explain why you took a trade that wasn't in your forecast.");
      link = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        tradeId,
        planned: false,
        forecastId: null,
        scenarioId: null,
        revisionIdAtEntry: null,
        adherence: null,
        reason,
      };
    }

    await repos.forecasts.saveLink(link);
    await repos.trades.save({ ...trade, status: trade.status === "OPEN" ? "UPDATED" : trade.status, updatedAt: now });
    await repos.changeHistory.add([change(trade, "forecastLink", existing ? summary(existing) : null, summary(link), now)]);
    return link;
  });
}

export async function clearForecastLink(repos: JournalRepositories, tradeId: EntityId, now: string = nowIso()) {
  await repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const existing = await repos.forecasts.getLinkForTrade(tradeId);
    if (!existing) return;
    await repos.forecasts.deleteLinkForTrade(tradeId);
    await assertStillComplete(repos, trade);
    await repos.trades.save({ ...trade, updatedAt: now });
    await repos.changeHistory.add([change(trade, "forecastLink", summary(existing), null, now)]);
  });
}

function summary(link: ForecastTradeLink) {
  return link.planned
    ? { planned: true, scenarioId: link.scenarioId, adherence: link.adherence, reason: link.reason }
    : { planned: false, reason: link.reason };
}

// ── reads ────────────────────────────────────────────────────────────────

export interface RevisionView {
  revision: ForecastRevision;
  scenario: ForecastScenario | null;
  /** Trade direction vs that revision's bias; null when neutral. */
  matchesBias: boolean | null;
}

export interface TradeForecastContext {
  link: ForecastTradeLink | null;
  /** Forecasts to choose from, newest first. */
  forecasts: Forecast[];
  /** The forecast for the trade's own day, if any. */
  dayForecast: Forecast | null;
  /** For the linked (or the day's) forecast. */
  forecast: Forecast | null;
  scenarios: ForecastScenario[];
  /** Revision active when the trade was opened (null if none was final yet). */
  atEntry: RevisionView | null;
  /** The latest revision of the forecast. */
  latest: RevisionView | null;
}

function view(revision: ForecastRevision | null, trade: Trade, scenarioId: EntityId | null): RevisionView | null {
  if (!revision) return null;
  return {
    revision,
    scenario: revision.content.scenarios.find((s) => s.id === scenarioId) ?? null,
    matchesBias: directionMatchesBias(trade.direction, revision.content.bias),
  };
}

export async function loadTradeForecastContext(
  repos: JournalRepositories,
  trade: Trade,
  forecastId?: EntityId | null,
): Promise<TradeForecastContext> {
  const [link, forecasts, settings] = await Promise.all([
    repos.forecasts.getLinkForTrade(trade.id),
    repos.forecasts.list(),
    repos.settings.getApp(),
  ]);
  const day = calendarDay(trade.openedAt, settings.timezone);
  const dayForecast = forecasts.find((f) => f.date === day) ?? null;
  const chosenId = forecastId ?? link?.forecastId ?? dayForecast?.id ?? null;
  const forecast = forecasts.find((f) => f.id === chosenId) ?? null;
  const revisions = forecast ? await repos.forecasts.listRevisions(forecast.id) : [];
  const scenarioId = link?.forecastId === forecast?.id ? (link?.scenarioId ?? null) : null;
  return {
    link: link ?? null,
    forecasts,
    dayForecast,
    forecast,
    scenarios: linkableRevision(revisions, trade.openedAt)?.content.scenarios ?? [],
    atEntry: view(revisionActiveAt(revisions, trade.openedAt), trade, scenarioId),
    latest: view(latestRevision(revisions), trade, scenarioId),
  };
}
