import type { Metadata } from "next";
import { TradeWorkspaceView } from "@/components/trades/workspace/trade-workspace";

export const metadata: Metadata = { title: "Trade" };

export default async function TradePage(props: PageProps<"/trades/[id]">) {
  const { id } = await props.params;
  return <TradeWorkspaceView tradeId={id} />;
}
