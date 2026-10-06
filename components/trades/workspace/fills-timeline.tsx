"use client";

import { LogIn, LogOut, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, Field, FormStatus, Input, Select } from "@/components/ui/form";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import type { ChangeHistory, TradeEvent, TradeEventType } from "@/lib/domain/types";
import { formatDateTime, formatPrice, formatTime, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { getRepositories } from "@/lib/repositories";
import { addFill, deleteFill, updateFill, type FillInput } from "@/lib/services/trades";
import { cn } from "@/lib/ui/cn";
import { errorMessage } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";

function FillForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FillInput;
  submitLabel: string;
  onSubmit: (input: FillInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const { ws } = useWorkspace();
  const tick = CONTRACT_SPECS[ws.trade.root].tickSize;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prefix = initial.timestamp + submitLabel;

  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timestamp = fromDateTimeLocal(String(form.get("timestamp")));
    if (!timestamp) return setError("Enter a valid time.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        type: String(form.get("type")) as TradeEventType,
        price: Number(form.get("price")),
        quantity: Number(form.get("quantity")),
        timestamp,
        reason: String(form.get("reason") ?? ""),
        notes: String(form.get("notes") ?? ""),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const id = (name: string) => `${prefix}-${name}`.replace(/\W+/g, "-");
  return (
    <form onSubmit={handle} className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Type" htmlFor={id("type")}>
          <Select id={id("type")} name="type" defaultValue={initial.type}>
            <option value="ENTRY">Entry</option>
            <option value="EXIT">Exit</option>
          </Select>
        </Field>
        <Field label="Price" htmlFor={id("price")}>
          <Input
            id={id("price")}
            name="price"
            type="number"
            step={tick}
            required
            defaultValue={Number.isNaN(initial.price) ? "" : initial.price}
            className="font-mono"
          />
        </Field>
        <Field label="Qty" htmlFor={id("quantity")}>
          <Input id={id("quantity")} name="quantity" type="number" min={1} step={1} required defaultValue={initial.quantity} />
        </Field>
      </div>
      <Field label="Time" htmlFor={id("timestamp")}>
        <Input
          id={id("timestamp")}
          name="timestamp"
          type="datetime-local"
          step={1}
          required
          defaultValue={toDateTimeLocal(initial.timestamp)}
        />
      </Field>
      <Field label="Reason" htmlFor={id("reason")}>
        <Input id={id("reason")} name="reason" defaultValue={initial.reason} placeholder="e.g. Scale out at first target" />
      </Field>
      <Field label="Notes" htmlFor={id("notes")}>
        <Input id={id("notes")} name="notes" defaultValue={initial.notes} />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
      <FormStatus status={error ? { kind: "error", message: error } : null} />
    </form>
  );
}

function FillItem({ event, onEdit, onDelete }: { event: TradeEvent; onEdit: () => void; onDelete: () => void }) {
  const { ws, locked, readOnly } = useWorkspace();
  const entry = event.type === "ENTRY";
  const Icon = entry ? LogIn : LogOut;
  return (
    <li className="relative pl-8">
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-0 flex size-6 items-center justify-center rounded-full",
          entry ? "bg-accent/15 text-accent" : "bg-surface-muted text-muted",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm">
            <span className="font-medium">{entry ? "Entry" : "Exit"}</span>{" "}
            <span className="font-mono tabular-nums">
              {event.quantity} @ {formatPrice(event.price)}
            </span>
          </p>
          <p className="text-xs text-muted">
            <time dateTime={event.timestamp}>{formatTime(event.timestamp, ws.settings.timezone)}</time>
          </p>
          {event.reason && <p className="mt-1 text-sm">{event.reason}</p>}
          {event.notes && <p className="mt-0.5 text-xs text-muted">{event.notes}</p>}
        </div>
        {!locked && !readOnly && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" className="p-1.5" onClick={onEdit} aria-label={`Edit ${entry ? "entry" : "exit"} fill`}>
              <Pencil aria-hidden className="size-3.5" />
            </Button>
            <Button variant="ghost" className="p-1.5" onClick={onDelete} aria-label={`Delete ${entry ? "entry" : "exit"} fill`}>
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function FillsTimeline() {
  const { ws, locked, readOnly, reload } = useWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TradeEvent | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addKey, setAddKey] = useState(0);
  const openQty = ws.metrics.fills?.openQuantity ?? 0;
  const lastPrice = ws.events.at(-1)?.price ?? ws.trade.plannedEntry;

  const repos = () => getRepositories();

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Timeline</h2>
        <p className="text-xs text-muted">
          {openQty > 0 ? `${openQty} contract${openQty === 1 ? "" : "s"} open` : "Position flat"}
          {ws.events[0] && ` · started ${formatDateTime(ws.events[0].timestamp, ws.settings.timezone)}`}
        </p>
      </div>

      <ol className="space-y-4 border-l border-border pl-0 [&>li]:-ml-3" aria-label="Fills">
        {ws.events.map((event) =>
          editingId === event.id ? (
            <li key={event.id} className="ml-0! rounded-lg border border-border p-3">
              <FillForm
                initial={event}
                submitLabel="Save fill"
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => {
                  await updateFill(repos(), event.id, input);
                  setEditingId(null);
                  reload();
                }}
              />
            </li>
          ) : (
            <FillItem
              key={event.id}
              event={event}
              onEdit={() => setEditingId(event.id)}
              onDelete={() => {
                setDeleteError(null);
                setDeleting(event);
              }}
            />
          ),
        )}
      </ol>
      {deleteError && <FormStatus status={{ kind: "error", message: deleteError }} />}

      {!locked && !readOnly && (
        <details className="rounded-lg border border-border" open={openQty > 0}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            Add fill
          </summary>
          <div className="border-t border-border p-3">
            <FillForm
              key={addKey}
              initial={{
                type: openQty > 0 ? "EXIT" : "ENTRY",
                price: lastPrice,
                quantity: Math.max(openQty, 1),
                timestamp: new Date().toISOString(),
                reason: "",
                notes: "",
              }}
              submitLabel="Add fill"
              onSubmit={async (input) => {
                await addFill(repos(), ws.trade.id, input);
                setAddKey((k) => k + 1);
                reload();
              }}
            />
          </div>
        </details>
      )}

      <ChangeHistoryList history={ws.history} timezone={ws.settings.timezone} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this fill?"
        confirmLabel="Delete fill"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteFill(repos(), deleting.id);
            reload();
          } catch (err) {
            setDeleteError(errorMessage(err));
          }
          setDeleting(null);
        }}
      >
        {deleting && (
          <>
            {deleting.type === "ENTRY" ? "Entry" : "Exit"} of {deleting.quantity} @ {formatPrice(deleting.price)}. The
            deletion is recorded in the change history.
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}

// ── change history ───────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  "fill.added": "Fill added",
  "fill.updated": "Fill edited",
  "fill.deleted": "Fill deleted",
  "psychology.BEFORE": "Psychology before",
  "psychology.DURING": "Psychology during",
  "psychology.AFTER": "Psychology after",
  deletedAt: "Trash",
  unlocked: "Lock",
};

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object" && value !== null && "type" in value && "price" in value) {
    const fill = value as { type: string; quantity: number; price: number };
    return `${fill.type === "ENTRY" ? "Entry" : "Exit"} ${fill.quantity} @ ${formatPrice(fill.price)}`;
  }
  if (typeof value === "object") return "updated";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function ChangeHistoryList({ history, timezone }: { history: readonly ChangeHistory[]; timezone: string }) {
  if (history.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
        Change history ({history.length})
      </summary>
      <ol className="mt-3 space-y-2">
        {history.map((entry) => (
          <li key={entry.id} className="text-xs">
            <p className="text-muted">
              <time dateTime={entry.changedAt}>{formatDateTime(entry.changedAt, timezone)}</time>
            </p>
            <p>
              <span className="font-medium">{FIELD_LABELS[entry.field] ?? entry.field}</span>:{" "}
              <span className="text-muted">{describe(entry.oldValue)}</span> → {describe(entry.newValue)}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
