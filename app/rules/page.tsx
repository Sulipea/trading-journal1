import { RulesView } from "@/components/rules/rules-view";
import { PageHeader } from "@/components/ui/page-header";

export default function RulesPage() {
  return (
    <>
      <PageHeader
        title="Rules"
        description="Your trading rules, grouped as you like. They form each trade's checklist."
      />
      <RulesView />
    </>
  );
}
