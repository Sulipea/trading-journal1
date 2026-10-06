import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewSetupView } from "@/components/setups/new-setup-view";
import { PageHeader } from "@/components/ui/page-header";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewSetupPage(props: PageProps<"/setups/new">) {
  const params = await props.searchParams;
  const tags = first(params.tags);
  return (
    <>
      <Link href="/setups" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Setups
      </Link>
      <PageHeader title="New setup" />
      <NewSetupView
        prefill={{
          name: first(params.name),
          description: first(params.description),
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        }}
      />
    </>
  );
}
