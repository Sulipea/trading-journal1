/**
 * Weekly/monthly review generation (spec §31). Deterministic: every finding
 * is computed from your data and carries the trades behind it. Kinds follow
 * spec §32's labels — data-backed observation, possible pattern, review
 * question — so later AI interpretations can sit beside them.
 */
import { breakdown } from "@/lib/analytics/breakdowns";
import type { AnalyticsRow } from "@/lib/analytics/dataset";
import { forecastAccuracy, type ForecastWithRevisions } from "@/lib/analytics/forecast";
import { detectPatterns, type Pattern } from "@/lib/analytics/patterns";
import { groupStats, MIN_SAMPLE } from "@/lib/analytics/stats";
import { drawdown } from "@/lib/calculations/performance";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import type { EntityId, FindingKind, ReviewKind, ReviewSection, RuleCheck } from "@/lib/domain/types";

export interface FindingDraft {
  /** Stable across regenerations (no random parts). */
  key: string;
  section: ReviewSection;
  kind: FindingKind;
  title: string;
  detail: string;
  tradeIds: EntityId[];
}

export interface ReviewInput {
  kind: ReviewKind;
  /** Closed trades in the period. */
  rows: readonly AnalyticsRow[];
  /** Closed trades in the previous period, for comparison. */
  previousRows: readonly AnalyticsRow[];
  /** Rule checks on the period's trades (names and severities are snapshotted on them). */
  checks: readonly RuleCheck[];
  /** Forecasts dated within the period. */
  forecasts: readonly ForecastWithRevisions[];
}

export const SECTION_ORDER: ReviewSection[] = [
  "PERFORMANCE",
  "RULES",
  "PSYCHOLOGY",
  "FORECAST",
  "EXECUTION",
  "SETUPS",
  "CONDITIONS",
];

export const SECTION_LABELS: Record<ReviewSection, string> = {
  PERFORMANCE: "Performance",
  RULES: "Mistakes & rules",
  PSYCHOLOGY: "Psychology",
  FORECAST: "Forecast accuracy",
  EXECUTION: "Execution",
  SETUPS: "Setups",
  CONDITIONS: "Market conditions",
};

const PATTERN_SECTION: Record<Pattern["dimension"], ReviewSection> = {
  setup: "SETUPS",
  emotion: "PSYCHOLOGY",
  ruleAdherence: "RULES",
  quality: "EXECUTION",
  forecastAdherence: "EXECUTION",
  direction: "EXECUTION",
  instrument: "CONDITIONS",
  session: "CONDITIONS",
  hour: "CONDITIONS",
  weekday: "CONDITIONS",
  condition: "CONDITIONS",
};

function money(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : v > 0 ? "+" : ""}$${abs}`;
}
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ids = (rows: readonly AnalyticsRow[]) => rows.map((r) => r.trade.id);

export function generateReviewFindings(input: ReviewInput): FindingDraft[] {
  const { rows } = input;
  const period = input.kind === "WEEKLY" ? "week" : "month";
  const findings: FindingDraft[] = [];
  const add = (f: FindingDraft) => findings.push(f);

  // ── performance ────────────────────────────────────────────────────────
  const stats = groupStats(rows);
  const prev = groupStats(input.previousRows);
  add({
    key: "perf.summary",
    section: "PERFORMANCE",
    kind: "OBSERVATION",
    title: `${money(stats.netPnl)} net over ${plural(stats.count, "closed trade")}`,
    detail:
      `Win rate ${pct(stats.winRate)}, expectancy ${money(stats.expectancy)} per trade, profit factor ${
        stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)
      }, average R ${stats.averageR === null ? "—" : stats.averageR.toFixed(2)}.` +
      (prev.count > 0 ? ` Previous ${period}: ${money(prev.netPnl)} over ${plural(prev.count, "trade")}.` : "") +
      (stats.smallSample ? ` Fewer than ${MIN_SAMPLE} trades — an early indication, not a conclusion.` : ""),
    tradeIds: ids(rows),
  });
  const sorted = [...rows].sort((a, b) => b.netPnl - a.netPnl);
  const best = sorted[0];
  const worst = sorted.at(-1);
  if (best && best.netPnl > 0) {
    add({
      key: "perf.best",
      section: "PERFORMANCE",
      kind: "OBSERVATION",
      title: `Best trade: ${money(best.netPnl)} (${best.trade.symbol})`,
      detail: [best.setupName && `Setup: ${best.setupName}.`, best.quality.grade && `Quality ${best.quality.grade}.`].filter(Boolean).join(" "),
      tradeIds: [best.trade.id],
    });
  }
  if (worst && worst.netPnl < 0) {
    add({
      key: "perf.worst",
      section: "PERFORMANCE",
      kind: "OBSERVATION",
      title: `Worst trade: ${money(worst.netPnl)} (${worst.trade.symbol})`,
      detail: [worst.setupName && `Setup: ${worst.setupName}.`, worst.quality.grade && `Quality ${worst.quality.grade}.`].filter(Boolean).join(" "),
      tradeIds: [worst.trade.id],
    });
  }
  const dd = drawdown(0, rows.map((r) => ({ netPnl: r.netPnl, closedAt: r.trade.closedAt! })));
  if (dd.maxDrawdown > 0) {
    add({
      key: "perf.drawdown",
      section: "PERFORMANCE",
      kind: "OBSERVATION",
      title: `Largest drawdown within the ${period}: -$${dd.maxDrawdown.toFixed(2)}`,
      detail: "Peak-to-trough decline of closed-trade P&L, in close order.",
      tradeIds: [],
    });
  }
  add({
    key: "perf.q",
    section: "PERFORMANCE",
    kind: "QUESTION",
    title:
      stats.netPnl < 0
        ? `What separated this ${period}'s losing trades from the winners?`
        : `What did you do well this ${period} that you want to repeat?`,
    detail: "",
    tradeIds: [],
  });

  // ── mistakes & rules ───────────────────────────────────────────────────
  const checked = rows.filter((r) => r.ruleChecks > 0);
  if (checked.length === 0) {
    add({
      key: "rules.none",
      section: "RULES",
      kind: "OBSERVATION",
      title: "No trades were checked against your rules",
      detail: "Rule adherence can't be judged without checklist answers.",
      tradeIds: [],
    });
  } else {
    const violating = checked.filter((r) => r.violations > 0);
    const clean = checked.filter((r) => r.violations === 0);
    add({
      key: "rules.summary",
      section: "RULES",
      kind: "OBSERVATION",
      title: `${violating.length} of ${plural(checked.length, "checked trade")} broke at least one rule`,
      detail:
        violating.length && clean.length
          ? `Trades with violations: ${money(groupStats(violating).netPnl)} net (n=${violating.length}). Trades without: ${money(groupStats(clean).netPnl)} net (n=${clean.length}).`
          : "",
      tradeIds: ids(violating),
    });
    const rowIds = new Set(ids(rows));
    const byRule = new Map<string, RuleCheck[]>();
    for (const c of input.checks) {
      if (c.status !== "VIOLATED" || !rowIds.has(c.tradeId)) continue;
      byRule.set(c.ruleId, [...(byRule.get(c.ruleId) ?? []), c]);
    }
    const pnlOf = new Map(rows.map((r) => [r.trade.id, r.netPnl]));
    [...byRule]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .forEach(([ruleId, list]) => {
        const name = list[0]!.ruleName;
        const net = list.reduce((s, c) => s + (pnlOf.get(c.tradeId) ?? 0), 0);
        add({
          key: `rules.rule:${ruleId}`,
          section: "RULES",
          kind: "OBSERVATION",
          title: `"${name}" broken ${plural(list.length, "time")}`,
          detail: `${list[0]!.severity.toLowerCase()} severity · those trades netted ${money(net)}.`,
          tradeIds: list.map((c) => c.tradeId),
        });
        add({
          key: `rules.q:${ruleId}`,
          section: "RULES",
          kind: "QUESTION",
          title: `What led you to break "${name}", and what would stop it next time?`,
          detail: "",
          tradeIds: list.map((c) => c.tradeId),
        });
      });
  }
  const skipped = rows.filter((r) => r.trade.requirementOverrides.length > 0);
  if (skipped.length) {
    const fields = [...new Set(skipped.flatMap((r) => r.trade.requirementOverrides.map((o) => REQUIRABLE_FIELD_LABELS[o.field])))];
    add({
      key: "rules.skipped",
      section: "RULES",
      kind: "OBSERVATION",
      title: `${plural(skipped.length, "trade")} skipped setup requirements`,
      detail: `Skipped: ${fields.join(", ")}. Each skip counts as a process violation.`,
      tradeIds: ids(skipped),
    });
  }
  const flagged = rows.filter((r) => r.trade.flaggedForReview);
  if (flagged.length) {
    add({
      key: "rules.flagged",
      section: "RULES",
      kind: "OBSERVATION",
      title: `${plural(flagged.length, "trade")} still flagged for review`,
      detail: "High-severity violations flag a trade until you mark it reviewed.",
      tradeIds: ids(flagged),
    });
  }

  // ── psychology ─────────────────────────────────────────────────────────
  const withEmotions = rows.filter((r) => r.emotions.length > 0);
  if (withEmotions.length === 0) {
    add({
      key: "psych.none",
      section: "PSYCHOLOGY",
      kind: "OBSERVATION",
      title: "No emotions recorded",
      detail: `None of the ${plural(rows.length, "trade")} have psychology entries.`,
      tradeIds: [],
    });
  } else {
    const emotions = breakdown(rows, "emotion");
    add({
      key: "psych.common",
      section: "PSYCHOLOGY",
      kind: "OBSERVATION",
      title: `Most common: ${emotions.slice(0, 3).map((e) => `${e.label} (${e.stats.count})`).join(", ")}`,
      detail: `${withEmotions.length} of ${plural(rows.length, "trade")} have emotions recorded.`,
      tradeIds: ids(withEmotions),
    });
    const worstEmotion = emotions.filter((e) => e.stats.count >= 2 && (e.stats.expectancy ?? 0) < 0).sort((a, b) => a.stats.expectancy! - b.stats.expectancy!)[0];
    if (worstEmotion) {
      add({
        key: `psych.emotion:${worstEmotion.key}`,
        section: "PSYCHOLOGY",
        kind: "OBSERVATION",
        title: `Trades where you felt ${worstEmotion.label} averaged ${money(worstEmotion.stats.expectancy)}`,
        detail: `n=${worstEmotion.stats.count}, win rate ${pct(worstEmotion.stats.winRate)}. A small sample — notice it, don't conclude from it.`,
        tradeIds: worstEmotion.tradeIds,
      });
    }
  }
  if (worst && worst.netPnl < 0) {
    add({
      key: "psych.q",
      section: "PSYCHOLOGY",
      kind: "QUESTION",
      title: "How were you feeling before your worst trade, and did it change your decisions?",
      detail: "",
      tradeIds: [worst.trade.id],
    });
  }

  // ── forecast accuracy ──────────────────────────────────────────────────
  if (input.forecasts.length === 0) {
    add({
      key: "forecast.none",
      section: "FORECAST",
      kind: "OBSERVATION",
      title: `No forecasts this ${period}`,
      detail: "",
      tradeIds: [],
    });
  } else {
    const accuracies = input.forecasts.map((f) => forecastAccuracy(f.forecast, f.revisions)).filter((a) => a !== null);
    const reviewed = accuracies.filter((a) => a.reviewed && a.finalBiasCorrect !== null);
    const unreviewed = input.forecasts.filter((f) => f.forecast.review === null);
    add({
      key: "forecast.bias",
      section: "FORECAST",
      kind: "OBSERVATION",
      title: reviewed.length
        ? `Bias called correctly on ${reviewed.filter((a) => a.finalBiasCorrect).length} of ${plural(reviewed.length, "reviewed day")}`
        : `${plural(input.forecasts.length, "forecast")}, none reviewed yet`,
      detail: `${plural(input.forecasts.length, "forecast")} this ${period}.`,
      tradeIds: [],
    });
    const scen = reviewed.reduce(
      (acc, a) => ({
        played: acc.played + a.scenarios.playedOut,
        partial: acc.partial + a.scenarios.partial,
        invalid: acc.invalid + a.scenarios.invalidated,
      }),
      { played: 0, partial: 0, invalid: 0 },
    );
    if (scen.played + scen.partial + scen.invalid > 0) {
      add({
        key: "forecast.scenarios",
        section: "FORECAST",
        kind: "OBSERVATION",
        title: `Triggered scenarios: ${scen.played} played out, ${scen.partial} partially, ${scen.invalid} invalidated`,
        detail: "",
        tradeIds: [],
      });
    }
    const effects = reviewed.filter((a) => a.revisionEffect);
    if (effects.length) {
      add({
        key: "forecast.revisions",
        section: "FORECAST",
        kind: "OBSERVATION",
        title: `Revisions improved the bias call ${effects.filter((a) => a.revisionEffect === "IMPROVED").length} time(s), worsened it ${effects.filter((a) => a.revisionEffect === "WORSENED").length}`,
        detail: `Out of ${plural(effects.length, "revised forecast")} with a review.`,
        tradeIds: [],
      });
    }
    if (unreviewed.length) {
      add({
        key: "forecast.q",
        section: "FORECAST",
        kind: "QUESTION",
        title: `${plural(unreviewed.length, "forecast")} still need an end-of-day review — what actually happened?`,
        detail: unreviewed.map((f) => f.forecast.date).join(", "),
        tradeIds: [],
      });
    }
  }

  // ── execution ──────────────────────────────────────────────────────────
  const count = (key: AnalyticsRow["forecastAdherence"]) => rows.filter((r) => r.forecastAdherence === key);
  const deviations = [...count("PARTIAL"), ...count("NO"), ...count("UNPLANNED")];
  add({
    key: "exec.adherence",
    section: "EXECUTION",
    kind: "OBSERVATION",
    title: `${count("YES").length} followed the forecast, ${deviations.length} deviated, ${count("UNLINKED").length} not linked`,
    detail: `Partially ${count("PARTIAL").length} · didn't follow ${count("NO").length} · unplanned ${count("UNPLANNED").length}.` +
      (deviations.length ? ` Deviations netted ${money(groupStats(deviations).netPnl)}.` : ""),
    tradeIds: ids(deviations),
  });
  const scored = rows.filter((r) => r.quality.score !== null);
  if (scored.length) {
    add({
      key: "exec.quality",
      section: "EXECUTION",
      kind: "OBSERVATION",
      title: `Average trade quality ${Math.round(groupStats(scored).averageQuality!)}`,
      detail: (["A", "B", "C", "D", "F"] as const)
        .map((g) => `${g}: ${scored.filter((r) => r.quality.grade === g).length}`)
        .join(" · "),
      tradeIds: [],
    });
  }
  const luckyWins = rows.filter((r) => r.quality.processOutcome === "POOR_PROCESS_WIN");
  const goodLosses = rows.filter((r) => r.quality.processOutcome === "GOOD_PROCESS_LOSS");
  if (luckyWins.length) {
    add({
      key: "exec.luckyWins",
      section: "EXECUTION",
      kind: "OBSERVATION",
      title: `${plural(luckyWins.length, "winning trade")} had poor process`,
      detail: `They netted ${money(groupStats(luckyWins).netPnl)} — profit that a disciplined process wouldn't have taken.`,
      tradeIds: ids(luckyWins),
    });
    add({
      key: "exec.luckyWins.q",
      section: "EXECUTION",
      kind: "QUESTION",
      title: "Which of these wins would you not take again?",
      detail: "",
      tradeIds: ids(luckyWins),
    });
  }
  if (goodLosses.length) {
    add({
      key: "exec.goodLosses",
      section: "EXECUTION",
      kind: "OBSERVATION",
      title: `${plural(goodLosses.length, "losing trade")} had good process`,
      detail: "Losses taken with discipline are part of the plan working.",
      tradeIds: ids(goodLosses),
    });
  }

  // ── setups ─────────────────────────────────────────────────────────────
  const setups = breakdown(rows, "setup");
  for (const g of [...setups].sort((a, b) => Math.abs(b.stats.netPnl) - Math.abs(a.stats.netPnl)).slice(0, 5)) {
    add({
      key: `setups.setup:${g.key}`,
      section: "SETUPS",
      kind: "OBSERVATION",
      title: `${g.label}: ${money(g.stats.netPnl)} over ${plural(g.stats.count, "trade")}`,
      detail: `Win rate ${pct(g.stats.winRate)}, expectancy ${money(g.stats.expectancy)}${
        g.stats.averageQuality !== null ? `, average quality ${Math.round(g.stats.averageQuality)}` : ""
      }.`,
      tradeIds: g.tradeIds,
    });
  }
  const noSetup = rows.filter((r) => r.trade.setupId === null);
  if (noSetup.length >= 2) {
    add({
      key: "setups.unassigned.q",
      section: "SETUPS",
      kind: "QUESTION",
      title: `Do the ${noSetup.length} trades without a setup share something worth naming?`,
      detail: "",
      tradeIds: ids(noSetup),
    });
  }

  // ── market conditions ──────────────────────────────────────────────────
  const extremes = (dimension: "session" | "hour" | "condition" | "weekday", noun: string) => {
    const groups = breakdown(rows, dimension).filter((g) => g.stats.count > 0);
    if (groups.length < 2) return;
    const byNet = [...groups].sort((a, b) => b.stats.netPnl - a.stats.netPnl);
    const top = byNet[0]!;
    const bottom = byNet.at(-1)!;
    add({
      key: `cond.${dimension}`,
      section: "CONDITIONS",
      kind: "OBSERVATION",
      title: `Best ${noun}: ${top.label} (${money(top.stats.netPnl)}); worst: ${bottom.label} (${money(bottom.stats.netPnl)})`,
      detail: `${groups.length} ${noun}s traded. Samples are small; compare in Analytics over longer periods.`,
      tradeIds: [...top.tradeIds, ...bottom.tradeIds],
    });
  };
  extremes("session", "session");
  extremes("hour", "hour");
  extremes("condition", "market condition");
  if (input.kind === "MONTHLY") extremes("weekday", "weekday");

  // ── possible patterns (rarely enough data within one period) ───────────
  for (const p of detectPatterns(rows)) {
    add({
      key: `pattern:${p.id}`,
      section: PATTERN_SECTION[p.dimension],
      kind: "PATTERN",
      title: p.statement.replace(/^Potential pattern: /, ""),
      detail: `Possible correlation, not a cause. ${p.group.count} trades vs ${p.rest.count} others.`,
      tradeIds: p.tradeIds,
    });
  }

  return findings;
}
