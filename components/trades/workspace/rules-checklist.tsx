"use client";

import Link from "next/link";
import { AlertTriangle, Check, X } from "lucide-react";
import { useState } from "react";
import { SeverityBadge } from "@/components/rules/badges";
import { Button, FormStatus, Textarea } from "@/components/ui/form";
import { SEVERITY_POLICY, type ChecklistIssue } from "@/lib/domain/checklist";
import type { Rule, RuleCheck, RuleGroup } from "@/lib/domain/types";
import { getRepositories } from "@/lib/repositories";
import { clearRuleCheck, saveRuleCheck } from "@/lib/services/trade-rules";
import { cn } from "@/lib/ui/cn";
import { errorMessage } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";
import { Section } from "./section";

function groupPath(groupId: string | null, groups: readonly RuleGroup[]): string {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const names: string[] = [];
  let current = groupId ? byId.get(groupId) : undefined;
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" › ");
}

const ISSUE_TEXT: Record<ChecklistIssue["kind"], string> = {
  UNANSWERED: "Required — answer before closing",
  NEEDS_ACKNOWLEDGMENT: "Acknowledge this violation",
  NEEDS_REASON: "Explain this violation",
};

export function RulesChecklistSection({ number }: { number: number }) {
  const { ws } = useWorkspace();
  const { rules, ruleChecks, ruleGroups, readiness, trade } = ws;
  const violations = ruleChecks.filter((c) => c.status === "VIOLATED").length;

  const sections = new Map<string, Rule[]>();
  for (const rule of rules) {
    const key = groupPath(rule.groupId, ruleGroups);
    sections.set(key, [...(sections.get(key) ?? []), rule]);
  }

  return (
    <Section
      number={number}
      title={`Rules / checklist${rules.length ? ` (${ruleChecks.length}/${rules.length})` : ""}`}
      incomplete={trade.status !== "CLOSED" && readiness.ruleIssues.length > 0}
      defaultOpen={rules.length > 0 && readiness.ruleIssues.length > 0}
    >
      {rules.length === 0 ? (
        <p className="text-sm text-muted">
          No rules apply to this trade.{" "}
          <Link href="/rules" className="text-accent hover:underline">
            Create rules
          </Link>{" "}
          to build a checklist.
        </p>
      ) : (
        <div className="space-y-5">
          {violations > 0 && (
            <p className="flex items-center gap-2 text-sm text-negative" role="status">
              <AlertTriangle aria-hidden className="size-4" />
              {violations} rule violation{violations === 1 ? "" : "s"} recorded on this trade.
            </p>
          )}
          {[...sections].map(([path, sectionRules]) => (
            <div key={path || "ungrouped"}>
              {path && <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{path}</h3>}
              <ul className="space-y-2">
                {sectionRules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    check={ruleChecks.find((c) => c.ruleId === rule.id) ?? null}
                    issues={readiness.ruleIssues.filter((i) => i.ruleId === rule.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function RuleRow({ rule, check, issues }: { rule: Rule; check: RuleCheck | null; issues: ChecklistIssue[] }) {
  const { ws, readOnly, reload } = useWorkspace();
  const [draftViolation, setDraftViolation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const policy = SEVERITY_POLICY[rule.severity];
  const showingViolationForm = draftViolation || (check?.status === "VIOLATED" && issues.length > 0);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setDraftViolation(false);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2.5",
        check?.status === "VIOLATED" ? "border-negative/40 bg-negative/5" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {rule.name}
            <SeverityBadge severity={rule.severity} />
            <span className="text-xs font-normal text-muted">{rule.required ? "Required" : "Optional"}</span>
          </p>
          {rule.description && <p className="mt-0.5 text-xs text-muted">{rule.description}</p>}
          {issues.map((i) => (
            <p key={i.kind} className="mt-1 text-xs text-negative">
              {ISSUE_TEXT[i.kind]}
            </p>
          ))}
          {check?.status === "VIOLATED" && check.reason && !showingViolationForm && (
            <p className="mt-1 text-xs">
              <span className="text-muted">Reason:</span> {check.reason}
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-1" role="group" aria-label={`Answer for ${rule.name}`}>
            <AnswerButton
              pressed={check?.status === "FOLLOWED" && !draftViolation}
              onClick={() =>
                run(() =>
                  saveRuleCheck(getRepositories(), ws.trade.id, rule.id, {
                    status: "FOLLOWED",
                    acknowledged: false,
                    reason: "",
                  }),
                )
              }
            >
              <Check aria-hidden className="size-3.5" /> Followed
            </AnswerButton>
            <AnswerButton
              danger
              pressed={check?.status === "VIOLATED" || draftViolation}
              onClick={() => {
                // Low severity needs nothing more; save straight away.
                if (!policy.acknowledgment && !policy.reason) {
                  void run(() =>
                    saveRuleCheck(getRepositories(), ws.trade.id, rule.id, {
                      status: "VIOLATED",
                      acknowledged: false,
                      reason: "",
                    }),
                  );
                } else {
                  setDraftViolation(true);
                }
              }}
            >
              <X aria-hidden className="size-3.5" /> Violated
            </AnswerButton>
            {check && (
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => run(() => clearRuleCheck(getRepositories(), ws.trade.id, rule.id))}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {showingViolationForm && !readOnly && (
        <ViolationForm
          rule={rule}
          check={check}
          onCancel={() => setDraftViolation(false)}
          onSave={(acknowledged, reason) =>
            run(() =>
              saveRuleCheck(getRepositories(), ws.trade.id, rule.id, { status: "VIOLATED", acknowledged, reason }),
            )
          }
        />
      )}
      {error && <FormStatus status={{ kind: "error", message: error }} />}
    </li>
  );
}

function AnswerButton({
  pressed,
  danger,
  onClick,
  children,
}: {
  pressed: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-ring",
        pressed
          ? danger
            ? "border-negative bg-negative/12 text-negative"
            : "border-positive bg-positive/12 text-positive"
          : "border-border text-muted hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

function ViolationForm({
  rule,
  check,
  onSave,
  onCancel,
}: {
  rule: Rule;
  check: RuleCheck | null;
  onSave: (acknowledged: boolean, reason: string) => void;
  onCancel: () => void;
}) {
  const policy = SEVERITY_POLICY[rule.severity];
  const [acknowledged, setAcknowledged] = useState(check?.acknowledged ?? false);
  const [reason, setReason] = useState(check?.reason ?? "");
  const ready = (!policy.acknowledgment || acknowledged) && (!policy.reason || reason.trim() !== "");
  const id = `violation-${rule.id}`;

  return (
    <div className="mt-3 space-y-3 border-t border-negative/30 pt-3" role="group" aria-label={`Violation of ${rule.name}`}>
      <p className="flex items-start gap-2 text-sm text-negative">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          You&apos;re recording a <strong>{rule.severity.toLowerCase()}-severity</strong> violation.
          {policy.flagForReview && " The trade will be flagged for review."}
        </span>
      </p>
      {policy.acknowledgment && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          I acknowledge I broke this rule
        </label>
      )}
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          Why? {policy.reason ? <span className="text-xs font-normal text-muted">(required)</span> : <span className="text-xs font-normal text-muted">(optional)</span>}
        </label>
        <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="danger" disabled={!ready} onClick={() => onSave(acknowledged, reason)}>
          Save violation
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
