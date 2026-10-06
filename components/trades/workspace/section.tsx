"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { Button, FormStatus } from "@/components/ui/form";
import { errorMessage } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";

/** A collapsible trade-workspace section (spec §6: collapsible sections). */
export function Section({
  number,
  title,
  defaultOpen,
  incomplete,
  children,
}: {
  number: number;
  title: string;
  defaultOpen?: boolean;
  /** Has required fields still empty. */
  incomplete?: boolean;
  children: ReactNode;
}) {
  // Only the first render decides; afterwards the section stays as the user left it,
  // even when saving changes what `defaultOpen` would be.
  const [initiallyOpen] = useState(defaultOpen);
  return (
    <details open={initiallyOpen} className="group rounded-xl border border-border bg-surface shadow-xs">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 select-none focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted transition group-open:rotate-90" />
        <span className="font-mono text-xs text-muted">{String(number).padStart(2, "0")}</span>
        <span className="font-medium">{title}</span>
        {incomplete && (
          <span className="ml-auto rounded-full bg-negative/12 px-2 py-0.5 text-xs font-medium text-negative">
            Incomplete
          </span>
        )}
      </summary>
      <div className="border-t border-border px-5 py-5">{children}</div>
    </details>
  );
}

/**
 * Form inside a section that saves via `onSave(formData)`, shows the result
 * and reloads the workspace on success.
 */
export function SectionForm({
  onSave,
  children,
  submitLabel = "Save",
  disabled,
  resetKey,
}: {
  onSave: (form: FormData) => Promise<unknown>;
  children: ReactNode;
  submitLabel?: string;
  disabled?: boolean;
  /**
   * When this changes (e.g. the saved record's updatedAt), the fields reset to
   * their new default values. The form itself stays mounted so the save
   * message remains visible.
   */
  resetKey?: string;
}) {
  const { reload, readOnly } = useWorkspace();
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave(new FormData(event.currentTarget));
      setStatus({ kind: "saved", message: "Saved." });
      reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Fragment key={resetKey}>{children}</Fragment>
      {!readOnly && (
        <div className="flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={busy || disabled}>
            {busy ? "Saving…" : submitLabel}
          </Button>
          <FormStatus status={status} />
        </div>
      )}
    </form>
  );
}

export function LaterPhase({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <p className="text-sm text-muted">
      {children} <span className="font-medium text-foreground">Arrives in Phase {phase}.</span>
    </p>
  );
}
