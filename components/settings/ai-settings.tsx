"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button, FormStatus } from "@/components/ui/form";
import { getRepositories } from "@/lib/repositories";
import { setAIAutoReview, setAIEnabled } from "@/lib/services/ai";
import { useAIState } from "@/lib/ui/ai";
import { errorMessage } from "@/lib/ui/use-journal";

const STATUS_TEXT = {
  NOT_CONFIGURED: "Not configured",
  CONFIGURED: "Available — off",
  ENABLED: "On",
  DISABLED: "Off",
} as const;

export function AISettings() {
  const query = useAIState();
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      setStatus({ kind: "saved", message });
      query.reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">AI</h2>
        <p className="mt-1 text-sm text-muted">
          Optional. AI can review closed trades and periods, look for patterns and answer questions about your journal.
          It only reads what is sent for each request and never changes your data or makes trading decisions. The
          journal works fully without it.
        </p>
      </div>
      {query.status !== "ready" ? (
        <p className="text-sm text-muted">Checking AI availability…</p>
      ) : (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="font-medium">{STATUS_TEXT[query.data.status]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Provider</dt>
              <dd>{query.data.server.provider ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Model</dt>
              <dd className="font-mono text-xs">{query.data.server.model ?? "—"}</dd>
            </div>
          </dl>

          {query.data.status === "NOT_CONFIGURED" ? (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">
              To enable AI, set <code className="font-mono">ANTHROPIC_API_KEY</code> on the server (for example in your
              Vercel project&apos;s environment variables, or a local <code className="font-mono">.env.local</code> file that
              is never committed), then restart. Optionally set <code className="font-mono">AI_MODEL</code> (default{" "}
              <code className="font-mono">claude-sonnet-5</code>). API keys are never sent to or stored in the browser.
            </p>
          ) : (
            <div className="space-y-3">
              <Button
                variant={query.data.status === "ENABLED" ? "secondary" : "primary"}
                onClick={() =>
                  run(
                    () => setAIEnabled(getRepositories(), query.data.status !== "ENABLED"),
                    query.data.status === "ENABLED" ? "AI turned off." : "AI turned on.",
                  )
                }
              >
                {query.data.status === "ENABLED" ? "Turn AI off" : "Turn AI on"}
              </Button>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={query.data.autoReview}
                  onChange={(e) =>
                    run(() => setAIAutoReview(getRepositories(), e.target.checked), "Auto-review preference saved.")
                  }
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  Review each trade automatically when it closes
                  <span className="block text-xs text-muted">
                    Sends that trade&apos;s data and up to five similar trades — no screenshots unless you choose them for a
                    manual review.
                  </span>
                </span>
              </label>
            </div>
          )}
          <FormStatus status={status} />
        </>
      )}
    </Card>
  );
}
