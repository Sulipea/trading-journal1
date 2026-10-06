"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FormStatus } from "@/components/ui/form";
import type { Trade } from "@/lib/domain/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { listTradeRows, permanentlyDelete, restoreFromTrash } from "@/lib/services/trades";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { DirectionBadge, SignedValue, StatusBadge } from "./badges";

export function TrashList() {
  const load = useCallback(
    async (repos: JournalRepositories) => ({
      rows: (await listTradeRows(repos, { deleted: true })).sort((a, b) =>
        (b.trade.deletedAt ?? "").localeCompare(a.trade.deletedAt ?? ""),
      ),
      timezone: (await repos.settings.getApp()).timezone,
    }),
    [],
  );
  const query = useJournalQuery(load);
  const [pending, setPending] = useState<Trade | null>(null);
  const [notice, setNotice] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading trash…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">The trash could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  const { rows, timezone } = query.data;

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      setNotice({ kind: "saved", message });
      query.reload();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-in space-y-4">
      <FormStatus status={notice} />
      {rows.length === 0 ? (
        <Card>
          <p className="font-medium">The trash is empty.</p>
          <p className="mt-1 text-sm text-muted">Deleted trades appear here and can be restored.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ trade, metrics }) => {
            const net = metrics.fills?.netPnl ?? null;
            return (
              <li key={trade.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div>
                    <Link href={`/trades/${trade.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                      <span className="font-mono">{trade.symbol}</span>
                      <DirectionBadge direction={trade.direction} />
                      <StatusBadge status={trade.status} />
                    </Link>
                    <p className="mt-1 text-xs text-muted">
                      Opened {formatDateTime(trade.openedAt, timezone)} · deleted{" "}
                      {trade.deletedAt && formatDateTime(trade.deletedAt, timezone)} ·{" "}
                      <SignedValue value={net}>{net === null ? "—" : formatMoney(net, { signed: true })}</SignedValue>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={busy}
                      onClick={() => run(() => restoreFromTrash(getRepositories(), trade.id), `${trade.symbol} restored.`)}
                    >
                      Restore
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={() => setPending(trade)}>
                      Delete permanently
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Permanently delete this trade?"
        confirmLabel="Yes, delete forever"
        danger
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const trade = pending;
          if (!trade) return;
          void run(async () => {
            await permanentlyDelete(getRepositories(), trade.id);
            setPending(null);
          }, `${trade.symbol} permanently deleted.`);
        }}
      >
        {pending && (
          <>
            <span className="font-mono">{pending.symbol}</span> and all of its fills, psychology, screenshots and
            history will be removed from this browser. This cannot be undone.
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
