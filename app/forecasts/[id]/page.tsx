import type { Metadata } from "next";
import { ForecastWorkspaceView } from "@/components/forecasts/forecast-workspace";

export const metadata: Metadata = { title: "Forecast" };

export default async function ForecastPage(props: PageProps<"/forecasts/[id]">) {
  const { id } = await props.params;
  return <ForecastWorkspaceView forecastId={id} />;
}
