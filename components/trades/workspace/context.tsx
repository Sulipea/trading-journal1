"use client";

import { createContext, useContext } from "react";
import type { RequirableField } from "@/lib/domain/types";
import type { TradeWorkspace } from "@/lib/services/trades";

export interface WorkspaceContextValue {
  ws: TradeWorkspace;
  /** True when the trade is closed and not manually unlocked. */
  locked: boolean;
  /** True while the trade is in the trash (read-only). */
  readOnly: boolean;
  required: ReadonlySet<RequirableField>;
  /** Re-load the workspace from storage after a change. */
  reload: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside the trade workspace");
  return value;
}

/** FormData helpers: a missing (e.g. disabled) field means "no change". */
export function formNumber(form: FormData, name: string): number | null | undefined {
  if (!form.has(name)) return undefined;
  const raw = String(form.get(name)).trim();
  return raw === "" ? null : Number(raw);
}

export function formText(form: FormData, name: string): string | undefined {
  return form.has(name) ? String(form.get(name)) : undefined;
}
