import { describe, expect, it } from "vitest";
import { newId } from "./ids";
import type { Rule, RuleCheck, SetupRule } from "./types";
import { applicableRules, checklistIssues, violationIssues } from "./checklist";

const T = "2026-10-06T14:00:00.000Z";
const rule = (name: string, overrides: Partial<Rule> = {}): Rule => ({
  id: newId(),
  createdAt: T,
  updatedAt: T,
  name,
  description: "",
  severity: "MEDIUM",
  groupId: null,
  required: true,
  active: true,
  appliesTo: "ALL",
  order: 0,
  ...overrides,
});
const check = (r: Rule, overrides: Partial<RuleCheck> = {}): RuleCheck => ({
  id: newId(),
  createdAt: T,
  updatedAt: T,
  tradeId: newId(),
  ruleId: r.id,
  ruleName: r.name,
  severity: r.severity,
  status: "FOLLOWED",
  acknowledged: false,
  reason: "",
  ...overrides,
});

describe("applicableRules", () => {
  const global = rule("Wait for confirmation");
  const inactive = rule("Old rule", { active: false });
  const setupOnly = rule("Enter on retest", { appliesTo: "SETUPS" });
  const setupId = newId();
  const links: SetupRule[] = [{ id: newId(), createdAt: T, updatedAt: T, setupId, ruleId: setupOnly.id, order: 0 }];

  it("includes active global rules, plus the setup's rules when a setup is chosen", () => {
    expect(applicableRules([global, inactive, setupOnly], null, links).map((r) => r.name)).toEqual([
      "Wait for confirmation",
    ]);
    expect(applicableRules([global, inactive, setupOnly], setupId, links).map((r) => r.name)).toEqual([
      "Wait for confirmation",
      "Enter on retest",
    ]);
  });

  it("keeps rules a trade was already checked against", () => {
    expect(applicableRules([global, inactive], null, [], [check(inactive)]).map((r) => r.name)).toContain("Old rule");
  });
});

describe("violation requirements by severity", () => {
  it("Low only warns, Medium needs acknowledgment, High needs acknowledgment and reason", () => {
    expect(violationIssues("LOW", { acknowledged: false, reason: "" })).toEqual([]);
    expect(violationIssues("MEDIUM", { acknowledged: false, reason: "" })).toEqual(["NEEDS_ACKNOWLEDGMENT"]);
    expect(violationIssues("HIGH", { acknowledged: true, reason: "  " })).toEqual(["NEEDS_REASON"]);
    expect(violationIssues("HIGH", { acknowledged: true, reason: "Chased the move" })).toEqual([]);
  });
});

describe("checklistIssues", () => {
  it("requires answers to required rules and complete violations", () => {
    const required = rule("Required", { severity: "HIGH" });
    const optional = rule("Optional", { required: false });
    const answered = rule("Answered", { severity: "HIGH" });

    const issues = checklistIssues(
      [required, optional, answered],
      [check(answered, { status: "VIOLATED", acknowledged: true })],
    );
    expect(issues).toEqual([
      { ruleId: required.id, ruleName: "Required", kind: "UNANSWERED" },
      { ruleId: answered.id, ruleName: "Answered", kind: "NEEDS_REASON" },
    ]);
  });
});
