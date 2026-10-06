import { ForecastsView } from "@/components/forecasts/forecasts-view";
import { PageHeader } from "@/components/ui/page-header";

export default function ForecastsPage() {
  return (
    <>
      <PageHeader
        title="Forecasts"
        description="Your daily market forecast, how it changed, and how it — and you — performed."
      />
      <ForecastsView />
    </>
  );
}
