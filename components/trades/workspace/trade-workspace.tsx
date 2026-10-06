"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Flag, Lock, LockOpen, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FormStatus, buttonClass } from "@/components/ui/form";
import { REQUIRABLE_FIELD_LABELS } from "@/lib/domain/defaults";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import { formatDateTime, formatDuration, formatMoney, formatR, formatRatio } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import {
  TradeServiceError,
  closeTrade,
  isLocked,
  loadTradeWorkspace,
  moveToTrash,
  setUnlocked,
} from "@/lib/services/trades";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { ReviewFlag } from "@/components/rules/badges";
import { setReviewFlag } from "@/lib/services/trade-rules";
import { DirectionBadge, LockBadge, SignedValue, StatusBadge } from "../badges";
import { WorkspaceContext, useWorkspace, type WorkspaceContextValue } from "./context";
import { FillsTimeline } from "./fills-timeline";
import { QualityCard } from "./quality-card";
import { TradeReviewCard } from "./trade-review-card";
import { TradeSections } from "./sections";

/** `forVersion` ties an error to the trade version it was about, so it disappears once the trade changes. */
type Notice = { kind: "saved" | "error"; message: string; forVersion: string } | null;

export function TradeWorkspaceView({ tradeId }: { tradeId: string }) {
  const load = useCallback((repos: JournalRepositories) => loadTradeWorkspace(repos, tradeId), [tradeId]);
  const query = useJournalQuery(load);
  const reload = query.reload;

  const context = useMemo<WorkspaceContextValue | null>(() => {
    if (query.status !== "ready") return null;
    const ws = query.data;
    return {
      ws,
      locked: isLocked(ws.trade),
      readOnly: ws.trade.deletedAt !== null,
      required: new Set(ws.settings.requiredFields),
      reload,
    };
  }, [query, reload]);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading trade…</p>;
  if (query.status === "error" || !context) {
    const notFound = query.status === "error" && query.error instanceof TradeServiceError && query.error.code === "NOT_FOUND";
    return (
      <Card role="alert">
        <p className="font-medium">{notFound ? "This trade does not exist." : "The trade could not be loaded."}</p>
        {!notFound && query.status === "error" && <p className="mt-1 text-sm text-muted">{query.error.message}</p>}
        <Link href="/trades" className={buttonClass("secondary", "mt-4")}>
          Back to trades
        </Link>
      </Card>
    );
  }

  return (
    <WorkspaceContext.Provider value={context}>
      <div className="animate-in space-y-6">
        <WorkspaceHeader />
        <Readiness />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TradeSections />
          <div className="space-y-6 lg:sticky lg:top-6">
            <FillsTimeline />
            <QualityCard />
            <TradeReviewCard />
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function WorkspaceHeader() {
  const { ws, readOnly, reload } = useWorkspace();
  const router = useRouter();
  const { trade, metrics } = ws;
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const net = metrics.fills?.netPnl ?? null;

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (success) setNotice({ kind: "saved", message: success, forVersion: trade.updatedAt });
      reload();
    } catch (error) {
      const missing =
        error instanceof TradeServiceError && error.missing.length > 0
          ? ` Missing: ${error.missing.map((f) => REQUIRABLE_FIELD_LABELS[f]).join(", ")}.`
          : "";
      setNotice({ kind: "error", message: errorMessage(error) + missing, forVersion: trade.updatedAt });
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="space-y-4">
      <Link href="/trades" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Trades
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="font-mono">{trade.symbol}</span>
            <DirectionBadge direction={trade.direction} />
            <StatusBadge status={trade.status} />
            <LockBadge trade={trade} />
            {trade.flaggedForReview && <ReviewFlag />}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {CONTRACT_SPECS[trade.root].name} · opened {formatDateTime(trade.openedAt, ws.settings.timezone)}
            {trade.closedAt && ` · closed ${formatDateTime(trade.closedAt, ws.settings.timezone)}`}
          </p>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {trade.status !== "CLOSED" ? (
              <Button
                variant="primary"
                disabled={busy || !ws.readiness.positionFlat}
                title={ws.readiness.positionFlat ? undefined : "Exit every open contract first"}
                onClick={() => run(() => closeTrade(getRepositories(), trade.id), "Trade closed.")}
              >
                <CheckCircle2 aria-hidden className="size-4" />
                Close trade
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() =>
                  run(
                    () => setUnlocked(getRepositories(), trade.id, !trade.unlocked),
                    trade.unlocked ? "Trade locked." : "Trade unlocked. Changes are recorded in the history.",
                  )
                }
              >
                {trade.unlocked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
                {trade.unlocked ? "Lock" : "Unlock"}
              </Button>
            )}
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  () => setReviewFlag(getRepositories(), trade.id, !trade.flaggedForReview),
                  trade.flaggedForReview ? "Marked as reviewed." : "Flagged for review.",
                )
              }
            >
              <Flag aria-hidden className="size-4" />
              {trade.flaggedForReview ? "Mark reviewed" : "Flag for review"}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => setConfirmTrash(true)}>
              <Trash2 aria-hidden className="size-4" />
              Move to trash
            </Button>
          </div>
        )}
      </div>

      {readOnly && (
        <p className="rounded-md bg-negative/10 px-3 py-2 text-sm text-negative">
          This trade is in the trash and is read-only. <Link href="/trades/trash" className="underline">Open trash</Link>{" "}
          to restore it.
        </p>
      )}
      <FormStatus status={notice?.kind === "error" && notice.forVersion !== trade.updatedAt ? null : notice} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={trade.status === "CLOSED" ? "Net P&L" : "Realized P&L"}>
          <SignedValue value={net}>{net === null ? "—" : formatMoney(net, { signed: true })}</SignedValue>
        </Stat>
        <Stat label="R multiple">
          <SignedValue value={metrics.rMultiple}>{formatR(metrics.rMultiple)}</SignedValue>
        </Stat>
        <Stat label="Planned risk (1R)">{metrics.plannedRisk === null ? "—" : formatMoney(metrics.plannedRisk)}</Stat>
        <Stat label="Planned R:R">{formatRatio(metrics.plannedRewardRisk)}</Stat>
        <Stat label="Open contracts">{metrics.fills?.openQuantity ?? "—"}</Stat>
        <Stat label="Duration">{formatDuration(metrics.durationMs)}</Stat>
      </dl>

      <ConfirmDialog
        open={confirmTrash}
        title="Move this trade to the trash?"
        confirmLabel="Move to trash"
        danger
        busy={busy}
        onCancel={() => setConfirmTrash(false)}
        onConfirm={() =>
          run(async () => {
            await moveToTrash(getRepositories(), trade.id);
            setConfirmTrash(false);
            router.push("/trades");
          })
        }
      >
        It stops counting toward statistics. You can restore it from the trash at any time.
      </ConfirmDialog>
    </header>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Readiness() {
  const { ws, readOnly } = useWorkspace();
  const { trade, readiness } = ws;
  if (trade.status === "CLOSED" || readOnly) return null;

  if (readiness.fillError) {
    return (
      <Banner tone="error">The fills are inconsistent: {readiness.fillError}</Banner>
    );
  }
  if (readiness.canClose) {
    return <Banner tone="ok">Position is flat and everything required is complete. Ready to close.</Banner>;
  }
  const missing = readiness.missing.map((f) => REQUIRABLE_FIELD_LABELS[f]);
  const rules = [...new Set(readiness.ruleIssues.map((i) => i.ruleName))];
  const todo = [
    missing.length > 0 ? `complete: ${missing.join(", ")}` : null,
    rules.length > 0 ? `finish the checklist: ${rules.join(", ")}` : null,
  ].filter(Boolean);
  return (
    <Banner tone="warn">
      {readiness.positionFlat ? "Position is flat. " : "Still in the trade. "}
      {todo.length > 0 ? `Before closing, ${todo.join("; and ")}.` : "Exit every open contract to close the trade."}
    </Banner>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  const styles = {
    ok: "border-positive/30 bg-positive/8 text-positive",
    warn: "border-border bg-surface-muted text-foreground",
    error: "border-negative/30 bg-negative/8 text-negative",
  }[tone];
  return (
    <div role="status" className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
