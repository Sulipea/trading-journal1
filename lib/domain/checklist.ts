/**
 * Rule checklists (spec §17): which rules apply to a trade and what each
 * severity demands when a rule is violated.
 */
import type { EntityId, Rule, RuleCheck, RuleSeverity, SetupRule } from "./types";

export interface SeverityPolicy {
  /** The violation must be explicitly acknowledged. */
  acknowledgment: boolean;
  /** The violation must be explained. */
  reason: boolean;
  /** The trade is flagged for review automatically. */
  flagForReview: boolean;
}

/** Low warns; Medium needs acknowledgment; High needs acknowledgment and a reason and flags the trade. */
export const SEVERITY_POLICY: Readonly<Record<RuleSeverity, SeverityPolicy>> = {
  LOW: { acknowledgment: false, reason: false, flagForReview: false },
  MEDIUM: { acknowledgment: true, reason: false, flagForReview: false },
  HIGH: { acknowledgment: true, reason: true, flagForReview: true },
};

export const SEVERITY_LABELS: Readonly<Record<RuleSeverity, string>> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/**
 * Rules on a trade's checklist: active rules that apply to all trades, then
 * the active rules linked to the trade's setup, in checklist order. Rules
 * the trade was already checked against stay listed even if since
 * deactivated, so history remains visible.
 */
export function applicableRules(
  rules: readonly Rule[],
  setupId: EntityId | null,
  setupLinks: readonly SetupRule[],
  existingChecks: readonly RuleCheck[] = [],
): Rule[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const result: Rule[] = [];
  const seen = new Set<EntityId>();
  const add = (rule: Rule | undefined) => {
    if (rule && !seen.has(rule.id)) {
      seen.add(rule.id);
      result.push(rule);
    }
  };

  for (const rule of rules) if (rule.active && rule.appliesTo === "ALL") add(rule);
  if (setupId) {
    const links = setupLinks.filter((l) => l.setupId === setupId).sort((a, b) => a.order - b.order);
    for (const link of links) {
      const rule = byId.get(link.ruleId);
      if (rule?.active) add(rule);
    }
  }
  for (const check of existingChecks) add(byId.get(check.ruleId));
  return result;
}

export type ChecklistIssueKind = "UNANSWERED" | "NEEDS_ACKNOWLEDGMENT" | "NEEDS_REASON";

export interface ChecklistIssue {
  ruleId: EntityId;
  ruleName: string;
  kind: ChecklistIssueKind;
}

/** What a violation of `severity` still needs, given its current answer. */
export function violationIssues(
  severity: RuleSeverity,
  check: Pick<RuleCheck, "acknowledged" | "reason">,
): ChecklistIssueKind[] {
  const policy = SEVERITY_POLICY[severity];
  const issues: ChecklistIssueKind[] = [];
  if (policy.acknowledgment && !check.acknowledged) issues.push("NEEDS_ACKNOWLEDGMENT");
  if (policy.reason && check.reason.trim() === "") issues.push("NEEDS_REASON");
  return issues;
}

/** Everything blocking a trade from closing on the rules side. */
export function checklistIssues(rules: readonly Rule[], checks: readonly RuleCheck[]): ChecklistIssue[] {
  const checkByRule = new Map(checks.map((c) => [c.ruleId, c]));
  const issues: ChecklistIssue[] = [];
  for (const rule of rules) {
    const check = checkByRule.get(rule.id);
    if (!check) {
      if (rule.required && rule.active) issues.push({ ruleId: rule.id, ruleName: rule.name, kind: "UNANSWERED" });
      continue;
    }
    if (check.status === "VIOLATED") {
      for (const kind of violationIssues(check.severity, check)) {
        issues.push({ ruleId: rule.id, ruleName: check.ruleName, kind });
      }
    }
  }
  return issues;
}
