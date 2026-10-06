import type { Metadata } from "next";
import { TradeList } from "@/components/trades/trade-list";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Trades" };

export default function TradesPage() {
  return (
    <>
      <PageHeader title="Trades" description="Every trade, newest first." />
      <TradeList />
    </>
  );
}
