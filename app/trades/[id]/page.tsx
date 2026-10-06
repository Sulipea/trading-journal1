import { TradeWorkspaceView } from "@/components/trades/workspace/trade-workspace";

export default async function TradePage(props: PageProps<"/trades/[id]">) {
  const { id } = await props.params;
  return <TradeWorkspaceView tradeId={id} />;
}
