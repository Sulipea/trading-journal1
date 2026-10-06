import { ComingSoon } from "@/components/ui/coming-soon";

export default function NewTradePage() {
  return (
    <ComingSoon
      title="New Trade"
      phase={2}
      summary="Quick entry (symbol, direction, entry price, contracts) and the full trade form."
    />
  );
}
