"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Copy, Lightbulb, Plus } from "lucide-react";
import { GroupStatsGrid, SampleSize } from "@/components/analytics/group-stats";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FormStatus, buttonClass } from "@/components/ui/form";
import type { DuplicateSuggestion, SetupSuggestion } from "@/lib/analytics/setup-discovery";
import { MIN_DISCOVERY_TRADES } from "@/lib/analytics/setup-discovery";
import type { Setup } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { loadSetupsOverview, mergeSetups } from "@/lib/services/setups";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";

type Filter = "active" | "archived";

export function SetupsView() {
  const load = useCallback((repos: JournalRepositories) => loadSetupsOverview(repos), []);
  const query = useJournalQuery(load);
  const [filter, setFilter] = useState<Filter>("active");
  const [merge, setMerge] = useState<{ source: Setup; target: Setup } | null>(null);
  const [notice, setNotice] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  if (query.status === "loading") return <p className="text-sm text-muted">Loading setups…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Setups could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  const { setups, unassigned, suggestions, duplicates } = query.data;
  const visible = setups.filter((s) => (filter === "active" ? s.setup.active : !s.setup.active));

  return (
    <div className="animate-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter setups" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(["active", "archived"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize focus-visible:outline-2 focus-visible:outline-ring",
                filter === f ? "bg-surface-muted font-medium" : "text-muted hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <Link href="/setups/new" className={buttonClass("primary")}>
          <Plus aria-hidden className="size-4" />
          New setup
        </Link>
      </div>
      <FormStatus status={notice} />

      {duplicates.length > 0 && filter === "active" && (
        <DuplicatesPanel duplicates={duplicates} onMerge={(source, target) => setMerge({ source, target })} />
      )}

      {visible.length === 0 ? (
        <Card>
          <p className="font-medium">{filter === "active" ? "No setups yet." : "No archived setups."}</p>
          {filter === "active" && (
            <p className="mt-1 text-sm text-muted">
              Setups describe the trades you look for. Each can have its own checklist and required fields.
            </p>
          )}
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map(({ setup, stats, mergedInto }) => (
            <li key={setup.id}>
              <Card className="h-full space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/setups/${setup.id}`} className="text-base font-semibold hover:underline">
                      {setup.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {setup.category}
                      {setup.tags.length > 0 && ` · ${setup.tags.join(", ")}`}
                    </p>
                    {mergedInto && (
                      <p className="mt-1 text-xs text-muted">
                        Merged into{" "}
                        <Link href={`/setups/${mergedInto.id}`} className="text-accent hover:underline">
                          {mergedInto.name}
                        </Link>
                      </p>
                    )}
                  </div>
                  <SampleSize stats={stats} />
                </div>
                {setup.description && <p className="line-clamp-2 text-sm text-muted">{setup.description}</p>}
                {stats.count > 0 && <GroupStatsGrid stats={stats} className="sm:grid-cols-3" />}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {filter === "active" && unassigned.count > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Trades without a setup</h2>
            <SampleSize stats={unassigned} />
          </div>
          <GroupStatsGrid stats={unassigned} className="mt-3" />
        </Card>
      )}

      {filter === "active" && <SuggestionsPanel suggestions={suggestions} />}

      <ConfirmDialog
        open={merge !== null}
        title={merge ? `Merge "${merge.source.name}" into "${merge.target.name}"?` : ""}
        confirmLabel="Merge setups"
        onCancel={() => setMerge(null)}
        onConfirm={async () => {
          const m = merge;
          setMerge(null);
          if (!m) return;
          try {
            await mergeSetups(getRepositories(), m.source.id, m.target.id);
            setNotice({ kind: "saved", message: `"${m.source.name}" merged into "${m.target.name}".` });
            query.reload();
          } catch (error) {
            setNotice({ kind: "error", message: errorMessage(error) });
          }
        }}
      >
        Future trades will use &ldquo;{merge?.target.name}&rdquo;. Past trades keep &ldquo;{merge?.source.name}&rdquo;,
        so its history and statistics are unchanged. The merged setup is archived, and its checklist rules and tags are
        added to &ldquo;{merge?.target.name}&rdquo;.
      </ConfirmDialog>
    </div>
  );
}

function DuplicatesPanel({
  duplicates,
  onMerge,
}: {
  duplicates: DuplicateSuggestion[];
  onMerge: (source: Setup, target: Setup) => void;
}) {
  return (
    <Card className="space-y-3 border-accent/40">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Copy aria-hidden className="size-4 text-accent" />
        Possible duplicate setups
      </h2>
      <ul className="space-y-2">
        {duplicates.map(({ a, b, reasons }) => (
          <li key={`${a.id}-${b.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{a.name}</span> and <span className="font-medium">{b.name}</span>
              <span className="text-xs text-muted"> — {reasons.join("; ")}</span>
            </span>
            <span className="ml-auto flex gap-2">
              <Button className="py-1 text-xs" onClick={() => onMerge(a, b)}>
                Merge into {b.name}
              </Button>
              <Button className="py-1 text-xs" onClick={() => onMerge(b, a)}>
                Merge into {a.name}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function suggestionHref(s: SetupSuggestion): string {
  const params = new URLSearchParams({ name: s.name, description: s.description, tags: s.keywords.join(", ") });
  return `/setups/new?${params}`;
}

function SuggestionsPanel({ suggestions }: { suggestions: SetupSuggestion[] }) {
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb aria-hidden className="size-4 text-accent" />
        Potential new setups
      </h2>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted">
          When at least {MIN_DISCOVERY_TRADES} closed trades without a setup share the same instrument, direction and
          session, they&apos;ll be suggested here as a potential setup. Nothing is created automatically.
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <li key={s.key} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.description}</p>
                  <p className="mt-1 text-xs text-muted">Potential pattern only — check the supporting trades.</p>
                </div>
                <Link href={suggestionHref(s)} className={buttonClass("secondary")}>
                  Create setup from this
                </Link>
              </div>
              <GroupStatsGrid stats={s.stats} className="mt-3" />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted">
                  Supporting trades ({s.supportingTradeIds.length})
                </summary>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {s.supportingTradeIds.map((id, i) => (
                    <li key={id}>
                      <Link href={`/trades/${id}`} className="rounded bg-surface-muted px-2 py-0.5 text-xs hover:underline">
                        Trade {i + 1}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
