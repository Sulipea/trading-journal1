"use client";

import { useCallback } from "react";
import { Card } from "@/components/ui/card";
import type { JournalRepositories } from "@/lib/repositories";
import { useJournalQuery } from "@/lib/ui/use-journal";
import { SetupForm, type SetupFormInitial } from "./setup-form";

export function NewSetupView({ prefill }: { prefill: Partial<Pick<SetupFormInitial, "name" | "description" | "tags">> }) {
  const load = useCallback(
    async (repos: JournalRepositories) => ({
      rules: await repos.rules.list(),
      settings: await repos.settings.getApp(),
    }),
    [],
  );
  const query = useJournalQuery(load);
  if (query.status !== "ready") {
    return <p className="text-sm text-muted">{query.status === "error" ? query.error.message : "Loading…"}</p>;
  }
  return (
    <Card className="animate-in max-w-3xl">
      <SetupForm
        initial={{
          name: prefill.name ?? "",
          description: prefill.description ?? "",
          category: "Other",
          tags: prefill.tags ?? [],
          requiredFields: [],
          ruleIds: [],
        }}
        allRules={query.data.rules}
        globalRequired={query.data.settings.requiredFields}
      />
    </Card>
  );
}
