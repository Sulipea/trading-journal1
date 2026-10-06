"use client";

import { useCallback, useSyncExternalStore } from "react";
import { fetchAIStatus, httpTransport } from "@/lib/ai/client";
import type { AIStatusResponse } from "@/lib/ai/schemas";
import type { AiStatus, EntityId } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { effectiveAIStatus, runTradeAIReview, type AIImageInput } from "@/lib/services/ai";
import { useJournalQuery } from "./use-journal";

export interface AIState {
  server: AIStatusResponse;
  status: AiStatus;
  autoReview: boolean;
}

/** Server availability + the user's AI choice. */
export function useAIState() {
  const load = useCallback(async (repos: JournalRepositories): Promise<AIState> => {
    const [server, settings] = await Promise.all([fetchAIStatus(), repos.settings.getApp()]);
    return { server, status: effectiveAIStatus(server, settings.aiStatus), autoReview: settings.aiAutoReview };
  }, []);
  return useJournalQuery(load);
}

// ── background trade reviews ─────────────────────────────────────────────

const running = new Set<EntityId>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while an AI review of this trade is running (e.g. the automatic one after close). */
export function useTradeReviewRunning(tradeId: EntityId): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running.has(tradeId),
    () => false,
  );
}

/**
 * Run an AI review of a trade in the background. Never throws: failures are
 * recorded on the review itself and the trade is unaffected.
 */
export async function startTradeAIReview(tradeId: EntityId, images: AIImageInput[] = []): Promise<void> {
  if (running.has(tradeId)) return;
  running.add(tradeId);
  notify();
  try {
    await runTradeAIReview(getRepositories(), tradeId, httpTransport, images);
  } catch {
    // e.g. the trade was reopened or deleted meanwhile — nothing to record.
  } finally {
    running.delete(tradeId);
    notify();
  }
}

/** After a trade closes: review it automatically if AI is enabled and auto-review is on (spec §32). */
export async function autoReviewOnClose(tradeId: EntityId): Promise<void> {
  const repos = getRepositories();
  const [server, settings] = await Promise.all([fetchAIStatus(), repos.settings.getApp()]);
  if (effectiveAIStatus(server, settings.aiStatus) === "ENABLED" && settings.aiAutoReview) {
    void startTradeAIReview(tradeId);
  }
}

// ── images ───────────────────────────────────────────────────────────────

/** Longest edge sent to the AI; larger images are downscaled in the browser. */
const MAX_EDGE = 1568;

/** Prepare a stored screenshot for the AI: downscaled JPEG, base64 without the data: prefix. */
export async function imageForAI(blob: Blob): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    bitmap.close();
  }
}
