"use client";

import Link from "next/link";
import { useCallback } from "react";
import { buttonClass } from "@/components/ui/form";
import { httpTransport } from "@/lib/ai/client";
import { patternsOutputSchema } from "@/lib/ai/schemas";
import type { AIReview } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { runPatternDiscovery } from "@/lib/services/ai";
import { AIRunPanel, OutputSection } from "./ai-run-panel";
import { StatementList } from "./statements";

export function PatternsAICard({ timezone }: { timezone: string }) {
  const load = useCallback(async (repos: JournalRepositories) => (await repos.ai.listReviewsByKind("PATTERNS")).slice(0, 5), []);
  return (
    <AIRunPanel
      title="AI pattern discovery"
      description="Sends one compact row per closed trade (your most recent 300; no notes or screenshots) plus your setups and the statistically detected patterns. Suggestions only — nothing is created for you."
      runLabel="Look for patterns with AI"
      load={load}
      run={() => runPatternDiscovery(getRepositories(), httpTransport)}
      timezone={timezone}
      renderOutput={(review: AIReview) => {
        const parsed = patternsOutputSchema.safeParse(review.output);
        if (!parsed.success) return <p className="text-sm text-negative">This result couldn&apos;t be read.</p>;
        const out = parsed.data;
        return (
          <>
            <OutputSection title="Possible patterns">
              <StatementList statements={out.patterns} refs={review.refs} />
            </OutputSection>
            {out.potentialSetups.length > 0 && (
              <OutputSection title="Potential new setups">
                <ul className="space-y-3">
                  {out.potentialSetups.map((s, i) => {
                    const known = s.refs.filter((r) => review.refs[r]);
                    const href = `/setups/new?${new URLSearchParams({ name: s.name, description: s.description })}`;
                    return (
                      <li key={i} className="rounded-lg border border-border p-3 text-sm">
                        <p className="font-medium">{s.name}</p>
                        <p className="mt-0.5 text-muted">{s.description}</p>
                        {s.evidence && <p className="mt-1 text-xs text-muted">Evidence: {s.evidence}</p>}
                        {known.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                            <span className="text-muted">Trades:</span>
                            {known.map((r) => (
                              <Link key={r} href={`/trades/${review.refs[r]}`} className="font-mono text-accent hover:underline">
                                {r}
                              </Link>
                            ))}
                          </p>
                        )}
                        <Link href={href} className={buttonClass("secondary", "mt-2 py-1 text-xs")}>
                          Create this setup…
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </OutputSection>
            )}
            {out.possibleDuplicateSetups.length > 0 && (
              <OutputSection title="Possible duplicate setups">
                <ul className="space-y-1.5 text-sm">
                  {out.possibleDuplicateSetups.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium">{d.setupA}</span> and <span className="font-medium">{d.setupB}</span>
                      <span className="text-muted"> — {d.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-muted">
                  Review and merge on the <Link href="/setups" className="text-accent hover:underline">Setups</Link> page if you agree.
                </p>
              </OutputSection>
            )}
            {out.reviewQuestions.length > 0 && (
              <OutputSection title="Review questions">
                <StatementList statements={out.reviewQuestions} refs={review.refs} />
              </OutputSection>
            )}
          </>
        );
      }}
    />
  );
}
