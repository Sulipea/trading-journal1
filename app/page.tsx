import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/ui/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Today at a glance. Detailed analysis lives in Analytics." />
      <DashboardView />
    </>
  );
}
