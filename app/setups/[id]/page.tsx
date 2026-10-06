import type { Metadata } from "next";
import { SetupDetailView } from "@/components/setups/setup-detail-view";

export const metadata: Metadata = { title: "Setup" };

export default async function SetupPage(props: PageProps<"/setups/[id]">) {
  const { id } = await props.params;
  return <SetupDetailView setupId={id} />;
}
