import { ForecastWorkspaceView } from "@/components/forecasts/forecast-workspace";

export default async function ForecastPage(props: PageProps<"/forecasts/[id]">) {
  const { id } = await props.params;
  return <ForecastWorkspaceView forecastId={id} />;
}
