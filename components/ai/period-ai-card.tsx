"use client";

import { useCallback } from "react";
import { httpTransport } from "@/lib/ai/client";
import { periodReviewOutputSchema, type PeriodReviewOutput } from "@/lib/ai/schemas";
import type { AIReview } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { runPeriodAIReview } from "@/lib/services/ai";
import { AIRunPanel, OutputSection } from "./ai-run-panel";
import { StatementList } from "./statements";

const SECTIONS: { key: keyof PeriodReviewOutput; title: string }[] = [
  { key: "overview", title: "Overview" },
  { key: "performance", title: "Performance" },
  { key: "mistakesAndRules", title: "Mistakes & rules" },
  { key: "psychology", title: "Psychology" },
  { key: "forecastAccuracy", title: "Forecast accuracy" },
  { key: "execution", title: "Execution" },
  { key: "setups", title: "Setups" },
  { key: "marketConditions", title: "Market conditions" },
  { key: "reviewQuestions", title: "Review questions" },
];

export function PeriodAICard({ reviewId, timezone }: { reviewId: string; timezone: string }) {
  const load = useCallback((repos: JournalRepositories) => repos.ai.listReviews(reviewId), [reviewId]);
  return (
    <AIRunPanel
      title="AI interpretation"
      description="Sends this review's findings and a compact list of its trades. Adds interpretation and connections; nothing in the review changes."
      runLabel="Interpret this review"
      load={load}
      run={() => runPeriodAIReview(getRepositories(), reviewId, httpTransport)}
      timezone={timezone}
      renderOutput={(review: AIReview) => {
        const parsed = periodReviewOutputSchema.safeParse(review.output);
        if (!parsed.success) return <p className="text-sm text-negative">This result couldn&apos;t be read.</p>;
        return SECTIONS.filter((s) => parsed.data[s.key].length > 0).map((s) => (
          <OutputSection key={s.key} title={s.title}>
            <StatementList statements={parsed.data[s.key]} refs={review.refs} />
          </OutputSection>
        ));
      }}
    />
  );
}
