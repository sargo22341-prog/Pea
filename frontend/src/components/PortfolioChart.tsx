/**
 * Rôle du fichier : afficher le chart de portefeuille à partir du DTO compact
 * pré-calculé par le backend.
 */

import type { PortfolioChartDto, RangeKey } from "@pea/shared";
import { PriceHistoryChart } from "./charts/PriceHistoryChart";

export function PortfolioChart({
  chart,
  range,
}: {
  chart: PortfolioChartDto;
  range: RangeKey;
}) {
  const chartData = toChartPoints(chart);

  return (
    <div>
      {chart.isPreparing && (
        <p className="px-4 pb-2 text-xs text-amber">Donnees en cours de preparation{chart.missingAssets?.length ? `: ${chart.missingAssets.join(", ")}` : ""}</p>
      )}
      <PriceHistoryChart
        baselineDatetime={chart.baselineDatetime}
        baselinePrice={chart.baselinePrice}
        data={chartData}
        margin={{ left: 0, right: 0, top: 16, bottom: 0 }}
        minTickGap={28}
        oneDayTooltipFormat="time"
        range={range}
      />
    </div>
  );
}

/**
 * Convertit les tableaux backend en points attendus par Recharts.
 *
 * @param chart DTO compact du portefeuille.
 * @returns Points date/value directement affichables.
 */
function toChartPoints(chart: PortfolioChartDto) {
  return chart.timestamps.map((timestamp, index) => ({
    date: new Date(timestamp).toISOString(),
    value: chart.value[index] ?? null
  }));
}
