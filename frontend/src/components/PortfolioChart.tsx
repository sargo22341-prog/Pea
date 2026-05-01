/**
 * Rôle du fichier : afficher le chart de portefeuille à partir du DTO compact
 * pré-calculé par le backend.
 */

import type { PortfolioChartDto, RangeKey } from "@pea/shared";
import { PriceHistoryChart } from "./charts/PriceHistoryChart";
import { formatMarketSessionHours, normalizeTimeZone } from "../lib/timezone";

export function PortfolioChart({
  chart,
  range,
  userTimezone
}: {
  chart: PortfolioChartDto;
  range: RangeKey;
  userTimezone?: string;
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
        marketSession={chart.marketSession}
        oneDayTooltipFormat="time"
        range={range}
        transactionMarkers={range === "1d" ? [] : chart.transactionMarkers}
        userTimezone={userTimezone}
      />
      {range === "1d" && chart.marketSession && chart.marketSession.timezone !== normalizeTimeZone(userTimezone) && (
        <p className="px-4 pt-2 text-xs text-slate-400">
          Horaires du marche : {chart.marketSession.city} {formatMarketSessionHours(chart.marketSession.open, chart.marketSession.close)}, heure locale du marche
        </p>
      )}
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
