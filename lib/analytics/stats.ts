/**
 * Group statistics over closed trades for setup and rule analytics.
 * Every result carries its sample size; small samples are flagged so
 * coincidences are never presented as facts (spec §18).
 */
import type { TradeQuality } from "@/lib/calculations/quality";
import { roundMoney } from "@/lib/calculations/money";
import type { EntityId, RuleCheck, RuleSeverity, Trade } from "@/lib/domain/types";

/** Below this many trades, results are labelled as a small sample. */
export const MIN_SAMPLE = 20;

export interface TradeResultRow {
  trade: Trade;
  netPnl: number;
  rMultiple: number | null;
  quality: TradeQuality;
}

export interface GroupStats {
  count: number;
  smallSample: boolean;
  winRate: number | null;
  netPnl: number;
  expectancy: number | null;
  averageR: number | null;
  profitFactor: number | null;
  averageQuality: number | null;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export function groupStats(rows: readonly TradeResultRow[]): GroupStats {
  const count = rows.length;
  const wins = rows.filter((r) => r.netPnl > 0);
  const grossProfit = wins.reduce((s, r) => s + r.netPnl, 0);
  const grossLoss = rows.filter((r) => r.netPnl < 0).reduce((s, r) => s + r.netPnl, 0);
  const net = grossProfit + grossLoss;
  const rs = rows.flatMap((r) => (r.rMultiple === null ? [] : [r.rMultiple]));
  const qs = rows.flatMap((r) => (r.quality.score === null ? [] : [r.quality.score]));
  return {
    count,
    smallSample: count < MIN_SAMPLE,
    winRate: count > 0 ? wins.length / count : null,
    netPnl: roundMoney(net),
    expectancy: count > 0 ? roundMoney(net / count) : null,
    averageR: mean(rs),
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    averageQuality: mean(qs),
  };
}

export interface RuleStats {
  ruleId: EntityId;
  /** Latest name and severity seen in the checks. */
  ruleName: string;
  severity: RuleSeverity;
  checked: number;
  violations: number;
  /** Fraction of checked trades that violated the rule. */
  violationRate: number | null;
  following: GroupStats;
  violating: GroupStats;
}

/**
 * Per-rule violation frequency and following-vs-violating results.
 * Only rows passed in are considered (e.g. closed trades of one setup).
 */
export function ruleStats(checks: readonly RuleCheck[], rows: readonly TradeResultRow[]): RuleStats[] {
  const rowByTrade = new Map(rows.map((r) => [r.trade.id, r]));
  const byRule = new Map<EntityId, RuleCheck[]>();
  for (const check of checks) {
    if (!rowByTrade.has(check.tradeId)) continue;
    byRule.set(check.ruleId, [...(byRule.get(check.ruleId) ?? []), check]);
  }

  return [...byRule].map(([ruleId, ruleChecks]) => {
    const latest = [...ruleChecks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
    const rowsFor = (status: RuleCheck["status"]) =>
      ruleChecks.filter((c) => c.status === status).map((c) => rowByTrade.get(c.tradeId)!);
    const violating = rowsFor("VIOLATED");
    return {
      ruleId,
      ruleName: latest.ruleName,
      severity: latest.severity,
      checked: ruleChecks.length,
      violations: violating.length,
      violationRate: ruleChecks.length > 0 ? violating.length / ruleChecks.length : null,
      following: groupStats(rowsFor("FOLLOWED")),
      violating: groupStats(violating),
    };
  }).sort((a, b) => b.violations - a.violations || a.ruleName.localeCompare(b.ruleName));
}
