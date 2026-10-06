"use client";

import { FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { SampleSize } from "@/components/analytics/group-stats";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, Field, FormStatus, Input, Select, Textarea } from "@/components/ui/form";
import { FormDialog } from "@/components/ui/form-dialog";
import type { GroupStats, RuleStats } from "@/lib/analytics/stats";
import { SEVERITY_LABELS } from "@/lib/domain/checklist";
import { ruleSeveritySchema } from "@/lib/domain/schemas";
import type { Rule, RuleGroup, RuleSeverity } from "@/lib/domain/types";
import { formatMoney, formatPercent, formatR } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import {
  buildRuleTree,
  createRule,
  deleteOrDeactivateRule,
  deleteRuleGroup,
  loadRulesOverview,
  saveRuleGroup,
  updateRule,
  type RuleInput,
  type RuleTreeNode,
} from "@/lib/services/rules";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { SeverityBadge } from "./badges";

type Editing =
  | { kind: "rule"; rule: Rule | null; groupId: string | null }
  | { kind: "group"; group: RuleGroup | null; parentId: string | null }
  | null;

const POLICY_TEXT: Record<RuleSeverity, string> = {
  LOW: "Violations show a warning only.",
  MEDIUM: "Violations must be acknowledged.",
  HIGH: "Violations must be acknowledged and explained, and flag the trade for review.",
};

/** Groups flattened with indentation, for parent/group pickers. */
function groupOptions(groups: readonly RuleGroup[], excludeId?: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const g of groups.filter((x) => x.parentId === parentId)) {
      if (g.id === excludeId) continue;
      out.push({ id: g.id, label: `${" ".repeat(depth)}${g.name}` });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function RulesView() {
  const load = useCallback((repos: JournalRepositories) => loadRulesOverview(repos), []);
  const query = useJournalQuery(load);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<{ kind: "rule"; rule: Rule } | { kind: "group"; group: RuleGroup } | null>(null);
  const [notice, setNotice] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading rules…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Rules could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  const { rules, groups, stats, closedTradeCount } = query.data;
  const tree = buildRuleTree(rules, groups);
  const repos = () => getRepositories();

  async function saveRule(form: FormData, existing: Rule | null) {
    const input: RuleInput = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      severity: String(form.get("severity")) as RuleSeverity,
      groupId: String(form.get("groupId") ?? "") || null,
      required: form.get("required") === "on",
      active: form.get("active") === "on",
      appliesTo: form.get("appliesTo") === "SETUPS" ? "SETUPS" : "ALL",
    };
    if (!input.name.trim()) throw new Error("Give the rule a name.");
    if (existing) await updateRule(repos(), existing.id, input);
    else await createRule(repos(), input);
    setNotice({ kind: "saved", message: `Rule "${input.name.trim()}" saved.` });
    query.reload();
  }

  async function saveGroup(form: FormData, existing: RuleGroup | null) {
    const name = String(form.get("name") ?? "");
    if (!name.trim()) throw new Error("Give the group a name.");
    await saveRuleGroup(repos(), {
      id: existing?.id,
      name,
      parentId: String(form.get("parentId") ?? "") || null,
    });
    setNotice({ kind: "saved", message: `Group "${name.trim()}" saved.` });
    query.reload();
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setEditing({ kind: "rule", rule: null, groupId: null })}>
          <Plus aria-hidden className="size-4" />
          New rule
        </Button>
        <Button onClick={() => setEditing({ kind: "group", group: null, parentId: null })}>
          <FolderPlus aria-hidden className="size-4" />
          New group
        </Button>
        <FormStatus status={notice} />
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Rules</h2>
          <p className="text-xs text-muted">
            &ldquo;All trades&rdquo; rules appear on every checklist; &ldquo;Setup only&rdquo; rules appear when a setup
            that includes them is chosen.
          </p>
        </div>
        {rules.length === 0 && groups.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No rules yet. Create your first rule to build trade checklists.</p>
        ) : (
          <RuleTree
            node={tree}
            onEditRule={(rule) => setEditing({ kind: "rule", rule, groupId: rule.groupId })}
            onAddRule={(groupId) => setEditing({ kind: "rule", rule: null, groupId })}
            onEditGroup={(group) => setEditing({ kind: "group", group, parentId: group.parentId })}
            onRemoveRule={(rule) => setRemoving({ kind: "rule", rule })}
            onRemoveGroup={(group) => setRemoving({ kind: "group", group })}
          />
        )}
      </Card>

      <RuleAnalytics stats={stats} closedTradeCount={closedTradeCount} />

      <FormDialog
        open={editing?.kind === "rule"}
        title={editing?.kind === "rule" && editing.rule ? "Edit rule" : "New rule"}
        submitLabel="Save rule"
        onClose={() => setEditing(null)}
        onSubmit={(form) => saveRule(form, editing?.kind === "rule" ? editing.rule : null)}
      >
        {editing?.kind === "rule" && <RuleFields rule={editing.rule} groupId={editing.groupId} groups={groups} />}
      </FormDialog>

      <FormDialog
        open={editing?.kind === "group"}
        title={editing?.kind === "group" && editing.group ? "Edit group" : "New group"}
        submitLabel="Save group"
        onClose={() => setEditing(null)}
        onSubmit={(form) => saveGroup(form, editing?.kind === "group" ? editing.group : null)}
      >
        {editing?.kind === "group" && (
          <>
            <Field label="Name" htmlFor="group-name">
              <Input id="group-name" name="name" required defaultValue={editing.group?.name ?? ""} autoFocus />
            </Field>
            <Field label="Inside group" htmlFor="group-parent">
              <Select id="group-parent" name="parentId" defaultValue={editing.parentId ?? ""}>
                <option value="">— Top level —</option>
                {groupOptions(groups, editing.group?.id).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        title={removing?.kind === "group" ? "Delete this group?" : "Remove this rule?"}
        confirmLabel={removing?.kind === "group" ? "Delete group" : "Remove rule"}
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const target = removing;
          setRemoving(null);
          try {
            if (target?.kind === "group") {
              await deleteRuleGroup(repos(), target.group.id);
              setNotice({ kind: "saved", message: `Group "${target.group.name}" deleted.` });
            } else if (target?.kind === "rule") {
              const result = await deleteOrDeactivateRule(repos(), target.rule.id);
              setNotice({
                kind: "saved",
                message:
                  result === "deleted"
                    ? `Rule "${target.rule.name}" deleted.`
                    : `"${target.rule.name}" has been used on trades, so it was deactivated instead of deleted.`,
              });
            }
            query.reload();
          } catch (error) {
            setNotice({ kind: "error", message: errorMessage(error) });
          }
        }}
      >
        {removing?.kind === "group"
          ? "Its rules and sub-groups move up one level. No rules are deleted."
          : "A rule that has never been used is deleted. A rule used on any trade is deactivated instead, so history is kept."}
      </ConfirmDialog>
    </div>
  );
}

function RuleFields({ rule, groupId, groups }: { rule: Rule | null; groupId: string | null; groups: RuleGroup[] }) {
  const [severity, setSeverity] = useState<RuleSeverity>(rule?.severity ?? "MEDIUM");
  return (
    <>
      <Field label="Name" htmlFor="rule-name">
        <Input id="rule-name" name="name" required defaultValue={rule?.name ?? ""} autoFocus />
      </Field>
      <Field label="Description" htmlFor="rule-description">
        <Textarea id="rule-description" name="description" rows={2} defaultValue={rule?.description ?? ""} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Severity</legend>
        <div className="grid grid-cols-3 gap-2">
          {ruleSeveritySchema.options.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center justify-center rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="severity"
                value={s}
                checked={severity === s}
                onChange={() => setSeverity(s)}
                className="sr-only"
              />
              {SEVERITY_LABELS[s]}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{POLICY_TEXT[severity]}</p>
      </fieldset>
      <Field label="Group" htmlFor="rule-group">
        <Select id="rule-group" name="groupId" defaultValue={rule?.groupId ?? groupId ?? ""}>
          <option value="">— No group —</option>
          {groupOptions(groups).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Applies to" htmlFor="rule-applies">
        <Select id="rule-applies" name="appliesTo" defaultValue={rule?.appliesTo ?? "ALL"}>
          <option value="ALL">All trades</option>
          <option value="SETUPS">Setup only (add it to a setup&apos;s checklist)</option>
        </Select>
      </Field>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="required" defaultChecked={rule?.required ?? true} className="size-4 accent-[var(--accent)]" />
          Required — must be answered before closing
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} className="size-4 accent-[var(--accent)]" />
          Active
        </label>
      </div>
    </>
  );
}

function RuleTree({
  node,
  onEditRule,
  onAddRule,
  onEditGroup,
  onRemoveRule,
  onRemoveGroup,
}: {
  node: RuleTreeNode;
  onEditRule: (rule: Rule) => void;
  onAddRule: (groupId: string | null) => void;
  onEditGroup: (group: RuleGroup) => void;
  onRemoveRule: (rule: Rule) => void;
  onRemoveGroup: (group: RuleGroup) => void;
}) {
  const indent = { paddingLeft: `${1.25 + Math.max(0, node.depth) * 1.25}rem` };
  return (
    <div>
      {node.group && (
        <div className="flex items-center gap-2 border-b border-border bg-surface-muted/60 py-2 pr-3" style={indent}>
          <h3 className="text-sm font-semibold">{node.group.name}</h3>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onAddRule(node.group!.id)}>
              <Plus aria-hidden className="size-3.5" /> Rule
            </Button>
            <IconButton label={`Edit group ${node.group.name}`} onClick={() => onEditGroup(node.group!)}>
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton label={`Delete group ${node.group.name}`} onClick={() => onRemoveGroup(node.group!)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </div>
      )}
      <ul>
        {node.rules.map((rule) => (
          <li
            key={rule.id}
            className={cn("flex items-start gap-3 border-b border-border py-3 pr-3", !rule.active && "opacity-60")}
            style={{ paddingLeft: `${1.25 + (node.depth + 1) * 1.25}rem` }}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {rule.name}
                <SeverityBadge severity={rule.severity} />
                <span className="text-xs font-normal text-muted">
                  {rule.required ? "Required" : "Optional"} · {rule.appliesTo === "ALL" ? "All trades" : "Setup only"}
                  {!rule.active && " · Inactive"}
                </span>
              </p>
              {rule.description && <p className="mt-0.5 text-xs text-muted">{rule.description}</p>}
            </div>
            <IconButton label={`Edit rule ${rule.name}`} onClick={() => onEditRule(rule)}>
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton label={`Remove rule ${rule.name}`} onClick={() => onRemoveRule(rule)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      {node.children.map((child) => (
        <RuleTree
          key={child.group!.id}
          node={child}
          onEditRule={onEditRule}
          onAddRule={onAddRule}
          onEditGroup={onEditGroup}
          onRemoveRule={onRemoveRule}
          onRemoveGroup={onRemoveGroup}
        />
      ))}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="ghost" className="p-1.5" onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden>{children}</span>
    </Button>
  );
}

function StatsCell({ stats }: { stats: GroupStats }) {
  if (stats.count === 0) return <span className="text-muted">—</span>;
  return (
    <div className="space-y-0.5">
      <SignedValue value={stats.netPnl}>{formatMoney(stats.netPnl, { signed: true })}</SignedValue>
      <p className="text-xs text-muted">
        Avg R {formatR(stats.averageR)} · avg quality{" "}
        {stats.averageQuality === null ? "—" : Math.round(stats.averageQuality)}
      </p>
      <SampleSize stats={stats} />
    </div>
  );
}

function RuleAnalytics({ stats, closedTradeCount }: { stats: RuleStats[]; closedTradeCount: number }) {
  return (
    <Card className="p-0">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold">Rule analytics</h2>
        <p className="text-xs text-muted">
          Closed trades only ({closedTradeCount}). Differences between following and violating are correlations, not
          proof of cause.
        </p>
      </div>
      {stats.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No closed trades have been checked against rules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Rule</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Violations</th>
                <th scope="col" className="px-3 py-2.5 font-medium">When followed</th>
                <th scope="col" className="px-3 py-2.5 font-medium">When violated</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.ruleId} className="border-b border-border align-top last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium">{s.ruleName}</p>
                    <SeverityBadge severity={s.severity} />
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums">
                    {s.violations} / {s.checked}
                    <p className="font-sans text-xs text-muted">{formatPercent(s.violationRate, 0)} of checked trades</p>
                  </td>
                  <td className="px-3 py-3">
                    <StatsCell stats={s.following} />
                  </td>
                  <td className="px-3 py-3">
                    <StatsCell stats={s.violating} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
