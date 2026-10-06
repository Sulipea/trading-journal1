import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Stored locally in this browser." />
      <SettingsView />
    </>
  );
}
