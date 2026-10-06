"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/ui/use-journal";
import { Button, FormStatus } from "./form";

/**
 * Modal form on the native <dialog>. `onSubmit` receives the form data;
 * throwing shows the error and keeps the dialog open.
 */
export function FormDialog({
  open,
  title,
  submitLabel,
  onSubmit,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  onSubmit: (form: FormData) => Promise<unknown>;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(new FormData(event.currentTarget));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="form-dialog-title"
      className="m-auto w-full max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      {open && (
        <form onSubmit={handle} className="space-y-4 p-6">
          <h2 id="form-dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          {children}
          <FormStatus status={error ? { kind: "error", message: error } : null} />
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
