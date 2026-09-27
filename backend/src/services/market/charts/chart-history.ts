import type { AssetChartDto, HistoryPoint } from "@pea/shared";

/** Recompose les points d'historique a partir des tableaux paralleles d'un graphique. */
export function chartHistoryPoints(chart: Pick<AssetChartDto, "timestamps" | "prices">): HistoryPoint[] {
  return chart.timestamps.flatMap((timestamp, index) => {
    const close = chart.prices[index];
    return close === undefined ? [] : [{ date: new Date(timestamp).toISOString(), close }];
  });
}
