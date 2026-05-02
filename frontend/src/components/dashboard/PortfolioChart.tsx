/**
 * Role du fichier : afficher le chart de portefeuille a partir du DTO compact
 * pre-calcule par le backend.
 *
 * Optimisations :
 * - React.memo evite les re-renders quand les props n'ont pas change.
 * - useMemo sur toChartPoints evite de recreer le tableau de points a chaque render du parent.
 */

import type { MarketSessionDto, PortfolioChartDto, RangeKey } from "@pea/shared";
import { memo, useMemo } from "react";
import { usePrivacy } from "../../contexts/PrivacyContext";
import { PriceHistoryChart } from "../charts/PriceHistoryChart";
import { formatMarketSessionHours, normalizeTimeZone } from "../../lib/timezone";

const fallbackIntradaySession: MarketSessionDto = {
  timezone: "Europe/Paris",
  city: "Paris",
  open: "09:00",
  close: "17:30"
};

export const PortfolioChart = memo(function PortfolioChart({
  chart,
  range,
  userTimezone
}: {
  chart: PortfolioChartDto;
  range: RangeKey;
  userTimezone?: string;
}) {
  const prive = usePrivacy();
  // Mémoïsé : la conversion tableau → points Recharts ne se refait que si chart change
  const chartData = useMemo(() => toChartPoints(chart), [chart]);
  const marketSession = range === "1d" ? chart.marketSession ?? fallbackIntradaySession : undefined;

  return (
    <div>
      {chart.isPreparing && (
        <p className="px-4 pb-2 text-xs text-amber">Donnees en cours de preparation{chart.missingAssets?.length ? `: ${chart.missingAssets.join(", ")}` : ""}</p>
      )}
      <PriceHistoryChart
        baselineDatetime={chart.baselineDatetime}
        baselinePrice={chart.baselinePrice}
        data={chartData}
        hideXAxisTicks
        margin={{ left: 0, right: 0, top: 16, bottom: 0 }}
        maskValues={prive}
        minTickGap={28}
        marketSession={marketSession}
        oneDayTooltipFormat="time"
        range={range}
        transactionMarkers={range === "1d" ? [] : chart.transactionMarkers}
        userTimezone={userTimezone}
      />
      {range === "1d" && marketSession && marketSession.timezone !== normalizeTimeZone(userTimezone) && (
        <p className="px-4 pt-2 text-xs text-slate-400">
          Horaires du marche : {marketSession.city} {formatMarketSessionHours(marketSession.open, marketSession.close)}, heure locale du marche
        </p>
      )}
    </div>
  );
});

/**
 * Convertit les tableaux backend en points attendus par Recharts.
 */
function toChartPoints(chart: PortfolioChartDto) {
  return chart.timestamps.map((timestamp, index) => ({
    date: new Date(timestamp).toISOString(),
    value: chart.value[index] ?? null
  }));
}
