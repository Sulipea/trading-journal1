import type { Metadata } from "next";
import { QuickEntryForm } from "@/components/trades/quick-entry-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New trade" };

export default function NewTradePage() {
  return (
    <>
      <PageHeader title="New Trade" />
      <QuickEntryForm />
    </>
  );
}
