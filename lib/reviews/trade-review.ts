/**
 * Automatic trade review framework (spec §32, "Automatic post-close
 * review"). The deterministic review covers the same sections the AI review
 * will (summary, rule violations, forecast adherence, psychology, execution,
 * quality vs outcome, similar trades, review questions); AI output can be
 * shown alongside it in Phase 7.
 */
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { groupStats, type GroupStats } from "@/lib/analytics/stats";
import { PROCESS_OUTCOME_LABELS } from "@/lib/calculations/quality";
import { PSYCHOLOGY_PHASE_LABELS } from "@/lib/domain/defaults";
import type { EntityId, FindingKind, PsychologyEntry, RuleCheck } from "@/lib/domain/types";

export type TradeReviewSectionKey =
  | "summary"
  | "rules"
  | "forecast"
  | "psychology"
  | "execution"
  | "quality"
  | "similar"
  | "questions";

export interface TradeReviewItem {
  kind: FindingKind;
  text: string;
  tradeIds?: EntityId[];
}

export interface TradeReviewSection {
  key: TradeReviewSectionKey;
  title: string;
  items: TradeReviewItem[];
}

export interface SimilarTrade {
  row: AnalyticsRow;
  score: number;
  similarities: string[];
  differences: string[];
}

export interface TradeReview {
  sections: TradeReviewSection[];
  similar: SimilarTrade[];
  /** Outcomes of the similar trades. */
  similarStats: GroupStats;
}

export interface TradeReviewInput {
  row: AnalyticsRow;
  checks: readonly RuleCheck[];
  psychology: readonly PsychologyEntry[];
  /** Scenario title of the forecast link, if planned. */
  scenarioTitle: string | null;
  /** Did the trade's direction agree with the forecast bias active at entry? */
  matchesBiasAtEntry: boolean | null;
  /** Other closed trades to compare against. */
  history: readonly AnalyticsRow[];
}

/** Minimum similarity score for a trade to count as similar. */
export const MIN_SIMILARITY = 3;
const MAX_SIMILAR = 5;

/**
 * Similarity on the dimensions the spec names: setup, market conditions,
 * forecast/scenario, psychology and rule adherence (plus direction and
 * instrument as tie-breakers).
 */
export function compareTrades(a: AnalyticsRow, b: AnalyticsRow): Omit<SimilarTrade, "row"> {
  const similarities: string[] = [];
  const differences: string[] = [];
  let score = 0;

  if (a.trade.setupId && a.trade.setupId === b.trade.setupId) {
    score += 3;
    similarities.push(`Same setup (${a.setupName})`);
  } else if (a.trade.setupId || b.trade.setupId) {
    differences.push(`Setup: ${b.setupName ?? "none"}`);
  }

  const tags = a.conditionTags.filter((t) => b.conditionTags.includes(t)).slice(0, 2);
  score += tags.length;
  if (tags.length) similarities.push(`Both in ${tags.join(", ")} conditions`);
  if (a.trade.session && a.trade.session === b.trade.session) {
    score += 1;
    similarities.push(`Same session (${a.sessionLabel})`);
  } else if (b.sessionLabel) {
    differences.push(`Session: ${b.sessionLabel}`);
  }

  if (a.forecastAdherence !== "UNLINKED" && a.forecastAdherence === b.forecastAdherence) {
    score += 1;
    similarities.push(a.forecastAdherence === "UNPLANNED" ? "Both unplanned" : `Same forecast adherence (${a.forecastAdherence.toLowerCase()})`);
  } else if (b.forecastAdherence !== "UNLINKED") {
    differences.push(`Forecast: ${b.forecastAdherence.toLowerCase()}`);
  }

  const emotions = a.emotions.filter((e) => b.emotions.some((x) => x.toLowerCase() === e.toLowerCase())).slice(0, 2);
  score += emotions.length;
  if (emotions.length) similarities.push(`Both felt ${emotions.join(", ")}`);

  if (a.ruleAdherence !== "UNCHECKED" && a.ruleAdherence === b.ruleAdherence) {
    score += 1;
    similarities.push(a.ruleAdherence === "CLEAN" ? "Both followed every rule" : "Both broke rules");
  } else if (b.ruleAdherence !== "UNCHECKED") {
    differences.push(b.ruleAdherence === "CLEAN" ? "It followed every rule" : "It broke rules");
  }

  if (a.trade.direction === b.trade.direction) score += 1;
  else differences.push(`Direction: ${b.trade.direction.toLowerCase()}`);
  if (a.trade.root === b.trade.root) score += 1;

  return { score, similarities, differences };
}

export function findSimilarTrades(row: AnalyticsRow, history: readonly AnalyticsRow[]): SimilarTrade[] {
  return history
    .filter((h) => h.trade.id !== row.trade.id)
    .map((h) => ({ row: h, ...compareTrades(row, h) }))
    .filter((s) => s.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || (b.row.trade.closedAt ?? "").localeCompare(a.row.trade.closedAt ?? ""))
    .slice(0, MAX_SIMILAR);
}

const money = (v: number | null) =>
  v === null ? "—" : `${v < 0 ? "-" : v > 0 ? "+" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildTradeReview(input: TradeReviewInput): TradeReview {
  const { row } = input;
  const t = row.trade;
  const sections: TradeReviewSection[] = [];
  const obs = (text: string, tradeIds?: EntityId[]): TradeReviewItem => ({ kind: "OBSERVATION", text, tradeIds });
  const question = (text: string): TradeReviewItem => ({ kind: "QUESTION", text });

  // Summary
  sections.push({
    key: "summary",
    title: "Summary",
    items: [
      obs(
        `${t.direction === "LONG" ? "Long" : "Short"} ${t.symbol}${row.setupName ? ` (${row.setupName})` : ""}, ` +
          `${money(row.netPnl)} net${row.rMultiple !== null ? ` (${row.rMultiple >= 0 ? "+" : ""}${row.rMultiple.toFixed(2)}R)` : ""}` +
          `${row.sessionLabel ? `, ${row.sessionLabel} session` : ""}.`,
      ),
    ],
  });

  // Rule violations
  const violations = input.checks.filter((c) => c.status === "VIOLATED");
  sections.push({
    key: "rules",
    title: "Rule violations",
    items:
      input.checks.length === 0
        ? [obs("No rules were checked on this trade.")]
        : violations.length === 0
          ? [obs(`All ${input.checks.length} checked rules were followed.`)]
          : violations.map((v) => obs(`Broke "${v.ruleName}" (${v.severity.toLowerCase()})${v.reason ? `: ${v.reason}` : "."}`)),
  });
  if (t.requirementOverrides.length) {
    sections.at(-1)!.items.push(obs(`Skipped ${t.requirementOverrides.length} setup requirement(s) — counted as a process violation.`));
  }

  // Forecast adherence
  const forecastItems: TradeReviewItem[] = [];
  switch (row.forecastAdherence) {
    case "UNLINKED":
      forecastItems.push(obs("Not linked to a forecast."));
      break;
    case "UNPLANNED":
      forecastItems.push(obs("Unplanned — not part of your forecast (a deviation)."));
      break;
    default:
      forecastItems.push(
        obs(
          `Scenario "${input.scenarioTitle ?? "?"}": ${
            row.forecastAdherence === "YES" ? "followed" : row.forecastAdherence === "PARTIAL" ? "partially followed (deviation)" : "not followed (deviation)"
          }.`,
        ),
      );
  }
  if (input.matchesBiasAtEntry !== null) {
    forecastItems.push(obs(`Direction was ${input.matchesBiasAtEntry ? "with" : "against"} the forecast bias active at entry.`));
  }
  sections.push({ key: "forecast", title: "Forecast adherence", items: forecastItems });

  // Psychology
  sections.push({
    key: "psychology",
    title: "Psychology",
    items: input.psychology.length
      ? input.psychology.map((p) =>
          obs(
            `${PSYCHOLOGY_PHASE_LABELS[p.phase]}: ${p.emotions.length ? p.emotions.join(", ") : "no emotions"}` +
              (Object.keys(p.ratings).length ? ` · ${Object.entries(p.ratings).map(([k, v]) => `${k} ${v}/5`).join(", ")}` : "") +
              (p.text ? ` · "${p.text}"` : ""),
          ),
        )
      : [obs("No psychology recorded.")],
  });

  // Execution
  const execution: TradeReviewItem[] = [];
  if (t.executionRating !== null) execution.push(obs(`You rated your execution ${t.executionRating}/5.`));
  if (t.executionNotes) execution.push(obs(`Notes: ${t.executionNotes}`));
  const q = row.quality.components;
  if (q.risk !== null) execution.push(obs(`Risk management scored ${q.risk}/100${t.plannedStop === null ? " (no planned stop)" : ""}.`));
  sections.push({ key: "execution", title: "Execution", items: execution.length ? execution : [obs("No execution rating or notes.")] });

  // Quality vs outcome
  sections.push({
    key: "quality",
    title: "Quality vs outcome",
    items: [
      obs(
        row.quality.score === null
          ? "Quality couldn't be scored yet."
          : `Quality ${row.quality.score} (${row.quality.grade})` +
              (row.quality.processOutcome ? ` — ${PROCESS_OUTCOME_LABELS[row.quality.processOutcome].toLowerCase()}.` : "."),
      ),
    ],
  });

  // Similar historical trades
  const similar = findSimilarTrades(row, input.history);
  const similarStats = groupStats(similar.map((s) => s.row));
  sections.push({
    key: "similar",
    title: "Similar historical trades",
    items: similar.length
      ? [
          obs(
            `${similar.length} similar trade(s): win rate ${similarStats.winRate === null ? "—" : `${Math.round(similarStats.winRate * 100)}%`}, ` +
              `expectancy ${money(similarStats.expectancy)}. Small sample — compare, don't conclude.`,
            similar.map((s) => s.row.trade.id),
          ),
        ]
      : [obs("No sufficiently similar closed trades yet.")],
  });

  // Review questions
  const questions: TradeReviewItem[] = [];
  if (violations.length) questions.push(question(`What made you break "${violations[0]!.ruleName}" on this trade?`));
  if (row.quality.processOutcome === "POOR_PROCESS_WIN") questions.push(question("Would you take this trade again exactly as you did, knowing the process was poor?"));
  if (row.quality.processOutcome === "GOOD_PROCESS_LOSS") questions.push(question("What, if anything, would you change — or was this simply a good trade that lost?"));
  if (row.forecastAdherence === "PARTIAL" || row.forecastAdherence === "NO" || row.forecastAdherence === "UNPLANNED") {
    questions.push(question("What pulled you away from your forecast, and was it new information or impulse?"));
  }
  if (similar.length && similarStats.expectancy !== null && Math.sign(similarStats.expectancy) !== Math.sign(row.netPnl)) {
    questions.push(question("Similar trades usually turned out differently. What was different this time?"));
  }
  if (questions.length === 0) questions.push(question("What is the one thing from this trade worth carrying into the next?"));
  sections.push({ key: "questions", title: "Review questions", items: questions });

  return { sections, similar, similarStats };
}
