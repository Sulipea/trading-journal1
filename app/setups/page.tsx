import type { Metadata } from "next";
import { SetupsView } from "@/components/setups/setups-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Setups" };

export default function SetupsPage() {
  return (
    <>
      <PageHeader title="Setups" description="The trades you look for, with their own checklists, requirements and statistics." />
      <SetupsView />
    </>
  );
}
