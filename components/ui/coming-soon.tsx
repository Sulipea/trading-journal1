import { Construction } from "lucide-react";
import { Card } from "./card";
import { PageHeader } from "./page-header";

/** Placeholder for sections delivered in later build phases (see BUILD_PLAN.md). */
export function ComingSoon({ title, phase, summary }: { title: string; phase: number; summary: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="animate-in flex items-start gap-4">
        <Construction aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p className="font-medium">Arrives in Phase {phase}</p>
          <p className="mt-1 text-sm text-muted">{summary}</p>
        </div>
      </Card>
    </>
  );
}
