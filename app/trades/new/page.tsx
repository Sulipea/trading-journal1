import { QuickEntryForm } from "@/components/trades/quick-entry-form";
import { PageHeader } from "@/components/ui/page-header";

export default function NewTradePage() {
  return (
    <>
      <PageHeader title="New Trade" />
      <QuickEntryForm />
    </>
  );
}
