import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TrashList } from "@/components/trades/trash-list";
import { PageHeader } from "@/components/ui/page-header";

export default function TrashPage() {
  return (
    <>
      <Link href="/trades" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Trades
      </Link>
      <PageHeader title="Trash" description="Deleted trades. Restore them, or delete them permanently." />
      <TrashList />
    </>
  );
}
