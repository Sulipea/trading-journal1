import { SettingsView } from "@/components/settings/settings-view";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Stored locally in this browser." />
      <SettingsView />
    </>
  );
}
