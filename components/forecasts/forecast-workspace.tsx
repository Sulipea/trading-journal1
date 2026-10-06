"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, CheckCircle2, GitBranch, Lock, LockOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, Field, FormStatus, Select, Textarea, buttonClass } from "@/components/ui/form";
import { diffForecastContent } from "@/lib/domain/forecast";
import type { ForecastContent, ForecastFieldChange, ForecastRevision } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { loadForecastWorkspace, type ForecastWorkspace } from "@/lib/services/forecast-views";
import { createRevision, finalizeForecast, setForecastReopened, updateDraft } from "@/lib/services/forecasts";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { ForecastContentView } from "./forecast-content-view";
import { DayTradesPanel, LevelsPanel, ReviewPanel, SnapshotsPanel } from "./forecast-day-panels";
import { ForecastEditor } from "./forecast-editor";
import {
  BIAS_LABELS,
  CONFIDENCE_LABELS,
  GEX_LABELS,
  LEVEL_TYPE_LABELS,
  REACTION_LABELS,
  biasTone,
  formatTradingDate,
} from "./labels";

type Notice = { kind: "saved" | "error"; message: string } | null;

export function ForecastWorkspaceView({ forecastId }: { forecastId: string }) {
  const load = useCallback((repos: JournalRepositories) => loadForecastWorkspace(repos, forecastId), [forecastId]);
  const query = useJournalQuery(load);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading forecast…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">This forecast could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
        <Link href="/forecasts" className={buttonClass("secondary", "mt-4")}>
          Back to forecasts
        </Link>
      </Card>
    );
  }
  return <Workspace ws={query.data} reload={query.reload} />;
}

function Workspace({ ws, reload }: { ws: ForecastWorkspace; reload: () => void }) {
  const { forecast, revisions, active, locked } = ws;
  const [mode, setMode] = useState<"view" | "revise">("view");
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  /** Editor content waiting for the finalize confirmation. */
  const [pendingFinalize, setPendingFinalize] = useState<ForecastContent | null>(null);
  const shown = revisions.find((r) => r.id === viewing) ?? active;
  const isPast = forecast.date < ws.today;
  const repos = () => getRepositories();

  async function run(action: () => Promise<unknown>, message: string) {
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "saved", message });
      reload();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <div className="animate-in space-y-6">
      <Link href="/forecasts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Forecasts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {formatTradingDate(forecast.date)}
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", biasTone(active.content.bias))}>
              {BIAS_LABELS[active.content.bias]}
            </span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
              {forecast.status === "DRAFT" ? "Draft" : `Final · revision ${active.number}`}
            </span>
            {locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                <Lock aria-hidden className="size-3" /> Locked
              </span>
            )}
            {forecast.reopenedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-negative/12 px-2 py-0.5 text-xs font-medium text-negative">
                <LockOpen aria-hidden className="size-3" /> Reopened
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {forecast.status === "DRAFT"
              ? "Edit freely, then finalize. After that, changes are made as revisions."
              : locked
                ? "The day is over, so this forecast is locked. Level outcomes and the end-of-day review can still be recorded."
                : "Final. Use Create revision to change it — every earlier version is kept."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {forecast.status === "FINAL" && !locked && mode === "view" && (
            <Button variant="primary" onClick={() => setMode("revise")}>
              <GitBranch aria-hidden className="size-4" />
              Create revision
            </Button>
          )}
          {isPast && (
            <Button
              onClick={() =>
                run(
                  () => setForecastReopened(repos(), forecast.id, locked),
                  locked ? "Forecast reopened for changes." : "Forecast locked again.",
                )
              }
            >
              {locked ? <LockOpen aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
              {locked ? "Reopen" : "Lock again"}
            </Button>
          )}
        </div>
      </header>
      <FormStatus status={notice} />

      {forecast.status === "DRAFT" && !locked ? (
        <Card>
          <ForecastEditor
            key={active.updatedAt}
            initial={active.content}
            setups={ws.setups}
            submitLabel="Save draft"
            onSubmit={async (content) => {
              await updateDraft(repos(), forecast.id, content);
              reload();
            }}
            secondary={{
              label: (
                <>
                  <CheckCircle2 aria-hidden className="size-4" />
                  Finalize…
                </>
              ),
              onClick: setPendingFinalize,
            }}
          />
        </Card>
      ) : mode === "revise" ? (
        <Card>
          <h2 className="mb-4 text-base font-semibold">New revision (from revision {active.number})</h2>
          <ReviseForm
            active={active}
            ws={ws}
            onDone={(message) => {
              setMode("view");
              setViewing(null);
              setNotice({ kind: "saved", message });
              reload();
            }}
            onCancel={() => setMode("view")}
          />
        </Card>
      ) : (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              {shown.number === 0 ? "Original forecast" : `Revision ${shown.number}`}
              {shown.id === active.id && <span className="ml-2 text-xs font-normal text-muted">(active)</span>}
            </h2>
            {revisions.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Show
                <Select value={shown.id} onChange={(e) => setViewing(e.target.value)} className="w-56">
                  {revisions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.number === 0 ? "Original" : `Revision ${r.number}`}
                      {r.id === active.id ? " (active)" : ""}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          <ForecastContentView content={shown.content} setups={ws.setups} />
        </Card>
      )}

      {forecast.status === "FINAL" && <RevisionTimeline revisions={revisions} timezone={ws.timezone} />}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SnapshotsPanel ws={ws} reload={reload} />
        <DayTradesPanel ws={ws} />
      </div>
      <LevelsPanel ws={ws} reload={reload} />
      {forecast.status === "FINAL" && <ReviewPanel ws={ws} reload={reload} />}

      <ConfirmDialog
        open={pendingFinalize !== null}
        title="Finalize this forecast?"
        confirmLabel="Finalize"
        onCancel={() => setPendingFinalize(null)}
        onConfirm={() => {
          const content = pendingFinalize;
          setPendingFinalize(null);
          if (!content) return;
          void run(async () => {
            await updateDraft(repos(), forecast.id, content);
            await finalizeForecast(repos(), forecast.id);
          }, "Forecast finalized.");
        }}
      >
        Your current edits are saved as the original forecast. After finalizing it can&apos;t be edited directly; every
        change becomes a revision with a reason, and earlier versions are kept.
      </ConfirmDialog>
    </div>
  );
}

function ReviseForm({
  active,
  ws,
  onDone,
  onCancel,
}: {
  active: ForecastRevision;
  ws: ForecastWorkspace;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<ForecastFieldChange[] | null>(null);

  return (
    <ForecastEditor
      initial={active.content}
      setups={ws.setups}
      submitLabel="Save revision"
      onCancel={onCancel}
      onSubmit={async (content: ForecastContent) => {
        setPreview(diffForecastContent(active.content, content));
        const revision = await createRevision(getRepositories(), ws.forecast.id, content, reason);
        onDone(`Revision ${revision.number} saved with ${revision.changes.length} change${revision.changes.length === 1 ? "" : "s"}.`);
      }}
      extra={
        <div className="space-y-2">
          <Field label="Why did the forecast change?" htmlFor="revision-reason" hint="Required. Shown in the revision timeline.">
            <Textarea id="revision-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          {preview && preview.length === 0 && <p className="text-sm text-negative">Nothing has changed yet.</p>}
        </div>
      }
    />
  );
}

/** Readable names for enum values that appear in revision changes. */
const VALUE_LABELS: Record<string, string> = {
  ...BIAS_LABELS,
  ...CONFIDENCE_LABELS,
  ...GEX_LABELS,
  ...LEVEL_TYPE_LABELS,
  ...REACTION_LABELS,
};

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return VALUE_LABELS[value] ?? value;
  if (Array.isArray(value)) return value.length ? value.map((v) => describe(v)).join(", ") : "—";
  if (typeof value === "object") return "…";
  return String(value);
}

function RevisionTimeline({ revisions, timezone }: { revisions: ForecastRevision[]; timezone: string }) {
  return (
    <Card>
      <h2 className="text-base font-semibold">Revision timeline</h2>
      <ol className="mt-4 space-y-4 border-l border-border pl-5">
        {revisions.map((r) => (
          <li key={r.id} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-accent bg-surface" />
            <p className="text-sm font-medium">
              {r.number === 0 ? "Original" : `Revision ${r.number}`}
              <span className="ml-2 text-xs font-normal text-muted">
                {r.finalizedAt ? formatDateTime(r.finalizedAt, timezone) : "draft"}
                {` · ${BIAS_LABELS[r.content.bias]}`}
              </span>
            </p>
            {r.reason && <p className="mt-0.5 text-sm">{r.reason}</p>}
            {r.changes.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                {r.changes.map((c) => (
                  <li key={c.path}>
                    {c.label}
                    {!c.path.match(/^(scenario|level):[^.]+$/) && (
                      <>
                        : <span className="line-through">{describe(c.oldValue)}</span> → {describe(c.newValue)}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
