"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { AIUnavailable } from "@/components/ai/ai-gate";
import { StatementList } from "@/components/ai/statements";
import { Card } from "@/components/ui/card";
import { Button, FormStatus } from "@/components/ui/form";
import { tradeReviewOutputSchema, type TradeReviewOutput } from "@/lib/ai/schemas";
import type { AIReview, TradeScreenshot } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { imageForAI, startTradeAIReview, useAIState, useTradeReviewRunning } from "@/lib/ui/ai";
import { useAssetUrl } from "@/lib/ui/use-asset-url";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { useWorkspace } from "./context";

const SECTIONS: { key: keyof TradeReviewOutput; title: string }[] = [
  { key: "summary", title: "Summary" },
  { key: "ruleViolations", title: "Rule violations" },
  { key: "forecastAdherence", title: "Forecast adherence" },
  { key: "psychology", title: "Psychology" },
  { key: "execution", title: "Execution" },
  { key: "qualityVsOutcome", title: "Quality vs outcome" },
  { key: "similarTrades", title: "Similar historical trades" },
  { key: "reviewQuestions", title: "Review questions" },
];

/** AI review of a closed trade (spec §32). Shown beside the deterministic review. */
export function AIReviewCard() {
  const { ws } = useWorkspace();
  if (ws.trade.status !== "CLOSED" || ws.trade.deletedAt !== null) return null;
  return <AIReviewPanel tradeId={ws.trade.id} timezone={ws.settings.timezone} screenshots={ws.screenshots} />;
}

function AIReviewPanel({ tradeId, timezone, screenshots }: { tradeId: string; timezone: string; screenshots: TradeScreenshot[] }) {
  const ai = useAIState();
  const running = useTradeReviewRunning(tradeId);
  const load = useCallback((repos: JournalRepositories) => repos.ai.listReviews(tradeId), [tradeId]);
  const reviews = useJournalQuery(load);
  const { reload } = reviews;
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Re-read whenever a run finishes (including the automatic one after close).
  useEffect(() => {
    if (!running) reload();
  }, [running, reload]);

  async function run() {
    setError(null);
    try {
      const images = [];
      for (const s of screenshots.filter((x) => selected.includes(x.id))) {
        const asset = await getRepositories().assets.get(s.assetId);
        if (!asset) continue;
        images.push({ screenshotId: s.id, caption: s.caption || s.fileName, ...(await imageForAI(asset.blob)) });
      }
      await startTradeAIReview(tradeId, images);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const list = reviews.status === "ready" ? reviews.data : [];
  const enabled = ai.status === "ready" && ai.data.status === "ENABLED";

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles aria-hidden className="size-4 text-accent" />
          AI review
        </h2>
        <p className="text-xs text-muted">Labelled observations, interpretations and questions. The AI can&apos;t change your trade.</p>
      </div>

      {ai.status === "ready" && !enabled && <AIUnavailable status={ai.data.status} />}

      {enabled && (
        <div className="space-y-3">
          {screenshots.length > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-xs text-muted">Include screenshots (only the ones you tick are sent, max 4)</legend>
              <div className="flex flex-wrap gap-2">
                {screenshots.map((s) => (
                  <ScreenshotChoice
                    key={s.id}
                    screenshot={s}
                    checked={selected.includes(s.id)}
                    disabled={!selected.includes(s.id) && selected.length >= 4}
                    onChange={(on) => setSelected((ids) => (on ? [...ids, s.id] : ids.filter((id) => id !== s.id)))}
                  />
                ))}
              </div>
            </fieldset>
          )}
          <Button variant="primary" disabled={running} onClick={run}>
            <Sparkles aria-hidden className="size-4" />
            {running ? "Reviewing…" : list.length ? "Run a new AI review" : "Run AI review"}
          </Button>
          <FormStatus status={error ? { kind: "error", message: error } : null} />
        </div>
      )}

      {running && <p className="text-sm text-muted" role="status">The AI is reviewing this trade…</p>}

      {list.map((review, i) => (
        <AIReviewResult key={review.id} review={review} timezone={timezone} tradeId={tradeId} defaultOpen={i === 0} />
      ))}
    </Card>
  );
}

function ScreenshotChoice({
  screenshot,
  checked,
  disabled,
  onChange,
}: {
  screenshot: TradeScreenshot;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const url = useAssetUrl(screenshot.thumbnailAssetId);
  const name = screenshot.caption || screenshot.fileName || "Screenshot";
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-1 pr-2 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
        <img src={url} alt="" className="h-8 w-12 rounded object-cover" />
      ) : (
        <span className="h-8 w-12 rounded bg-surface-muted" />
      )}
      <span className="max-w-32 truncate">{name}</span>
    </label>
  );
}

function AIReviewResult({ review, timezone, tradeId, defaultOpen }: { review: AIReview; timezone: string; tradeId: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const output = review.status === "COMPLETE" ? tradeReviewOutputSchema.safeParse(review.output) : null;
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight aria-hidden className={`size-3.5 transition ${open ? "rotate-90" : ""}`} />
        {formatDateTime(review.createdAt, timezone)}
        {review.status === "COMPLETE" ? ` · ${review.model}` : " · failed"}
        {review.screenshotIds.length > 0 && ` · ${review.screenshotIds.length} screenshot(s)`}
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {review.status === "FAILED" || !output?.success ? (
            <p className="text-sm text-negative" role="alert">
              {review.error || "This AI review couldn't be read."} Your trade is unaffected.
            </p>
          ) : (
            SECTIONS.filter((s) => output.data[s.key].length > 0).map((s) => (
              <section key={s.key}>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{s.title}</h3>
                <StatementList statements={output.data[s.key]} refs={review.refs} currentTradeId={tradeId} />
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
