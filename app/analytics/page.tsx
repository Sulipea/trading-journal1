import { AnalyticsView } from "@/components/analytics/analytics-view";
import { PageHeader } from "@/components/ui/page-header";

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Closed trades only. Every number shows its sample size; small samples are flagged."
      />
      <AnalyticsView />
    </>
  );
}
