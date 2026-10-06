"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { GroupStatsGrid, SampleSize } from "@/components/analytics/group-stats";
import { QualityBadge, SeverityBadge } from "@/components/rules/badges";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FormStatus, buttonClass } from "@/components/ui/form";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import { formatDateTime, formatMoney, formatPercent, formatR } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { deleteUnusedSetup, loadSetupDetail, setSetupActive } from "@/lib/services/setups";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { SetupForm, setupToInitial } from "./setup-form";

export function SetupDetailView({ setupId }: { setupId: string }) {
  const load = useCallback(
    async (repos: JournalRepositories) => ({
      detail: await loadSetupDetail(repos, setupId),
      settings: await repos.settings.getApp(),
    }),
    [setupId],
  );
  const query = useJournalQuery(load);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading setup…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">This setup could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
        <Link href="/setups" className={buttonClass("secondary", "mt-4")}>
          Back to setups
        </Link>
      </Card>
    );
  }
  const { detail, settings } = query.data;
  const { setup } = detail;
  const tz = settings.timezone;

  async function toggleArchive() {
    try {
      await setSetupActive(getRepositories(), setup.id, !setup.active);
      setNotice({ kind: "saved", message: setup.active ? "Setup archived." : "Setup restored." });
      query.reload();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <div className="animate-in space-y-6">
      <Link href="/setups" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Setups
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{setup.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {setup.category}
            {setup.tags.length > 0 && ` · ${setup.tags.join(", ")}`}
            {!setup.active && " · Archived"}
          </p>
          {detail.mergedInto && (
            <p className="mt-1 text-sm">
              Merged into{" "}
              <Link href={`/setups/${detail.mergedInto.id}`} className="text-accent hover:underline">
                {detail.mergedInto.name}
              </Link>
              . Its past trades and statistics are kept here unchanged.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!detail.mergedInto && (
            <Button onClick={() => setEditing((e) => !e)}>
              <Pencil aria-hidden className="size-4" />
              {editing ? "Close editor" : "Edit"}
            </Button>
          )}
          {!detail.mergedInto && (
            <Button onClick={toggleArchive}>
              {setup.active ? <Archive aria-hidden className="size-4" /> : <ArchiveRestore aria-hidden className="size-4" />}
              {setup.active ? "Archive" : "Restore"}
            </Button>
          )}
          {detail.usageCount === 0 && detail.mergedFrom.length === 0 && !detail.mergedInto && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </header>
      <FormStatus status={notice} />

      {editing ? (
        <Card>
          <SetupForm
            setupId={setup.id}
            initial={setupToInitial(setup, detail.rules)}
            allRules={detail.allRules}
            globalRequired={settings.requiredFields}
            onSaved={() => {
              setEditing(false);
              setNotice({ kind: "saved", message: "Setup saved." });
              query.reload();
            }}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3 lg:col-span-2">
            <h2 className="text-sm font-semibold">Description</h2>
            <p className="text-sm whitespace-pre-wrap text-muted">{setup.description || "No description yet."}</p>
          </Card>
          <Card className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Required to close</h2>
              <p className="mt-1 text-sm text-muted">
                {setup.requiredFields.length === 0
                  ? "Only the global requirements."
                  : setup.requiredFields.map((f) => REQUIRABLE_FIELD_LABELS[f]).join(", ")}
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Checklist rules</h2>
              {detail.rules.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Only the rules for all trades.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {detail.rules.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      {r.name} <SeverityBadge severity={r.severity} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Statistics</h2>
          <SampleSize stats={detail.stats} />
        </div>
        <GroupStatsGrid stats={detail.stats} />
        {detail.combinedStats && (
          <div className="border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Including merged setups</h3>
              <SampleSize stats={detail.combinedStats} />
            </div>
            <GroupStatsGrid stats={detail.combinedStats} className="mt-2" />
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {detail.mergedFrom.map(({ history, stats }) => (
                <li key={history.id}>
                  <Link href={`/setups/${history.sourceSetupId}`} className="text-accent hover:underline">
                    {history.sourceName}
                  </Link>{" "}
                  merged in on {formatDateTime(history.mergedAt, tz)} · {stats.count} trades
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Rule-level analysis</h2>
          <p className="text-xs text-muted">How this setup&apos;s trades did when each rule was followed or violated.</p>
        </div>
        {detail.ruleStats.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted">No checked rules on closed trades yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">Rule</th>
                <th scope="col" className="px-3 py-2 font-medium">Violated</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Followed: net</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Violated: net</th>
              </tr>
            </thead>
            <tbody>
              {detail.ruleStats.map((r) => (
                <tr key={r.ruleId} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">
                    {r.ruleName} <SeverityBadge severity={r.severity} />
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    {r.violations}/{r.checked} ({formatPercent(r.violationRate, 0)})
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <SignedValue value={r.following.netPnl}>
                      {r.following.count ? formatMoney(r.following.netPnl, { signed: true }) : "—"}
                    </SignedValue>{" "}
                    <span className="text-xs text-muted">n={r.following.count}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <SignedValue value={r.violating.netPnl}>
                      {r.violating.count ? formatMoney(r.violating.netPnl, { signed: true }) : "—"}
                    </SignedValue>{" "}
                    <span className="text-xs text-muted">n={r.violating.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Trades</h2>
          <p className="text-xs text-muted">Closed trades logged with this setup.</p>
        </div>
        {detail.trades.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted">No closed trades with this setup yet.</p>
        ) : (
          <ul>
            {detail.trades.map(({ trade, netPnl, rMultiple, quality }) => (
              <li key={trade.id} className="flex items-center gap-3 border-b border-border px-5 py-2.5 text-sm last:border-0">
                <Link href={`/trades/${trade.id}`} className="font-mono font-medium hover:underline">
                  {trade.symbol}
                </Link>
                <span className="text-xs text-muted">{trade.closedAt && formatDateTime(trade.closedAt, tz)}</span>
                <span className="ml-auto">
                  <SignedValue value={netPnl}>{formatMoney(netPnl, { signed: true })}</SignedValue>
                </span>
                <SignedValue value={rMultiple}>{formatR(rMultiple)}</SignedValue>
                <QualityBadge quality={quality} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this setup?"
        confirmLabel="Delete setup"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await deleteUnusedSetup(getRepositories(), setup.id);
            router.push("/setups");
          } catch (error) {
            setNotice({ kind: "error", message: errorMessage(error) });
          }
        }}
      >
        No trade uses it, so nothing else changes.
      </ConfirmDialog>
    </div>
  );
}
