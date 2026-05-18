import type { MarketSessionDto, PortfolioChartDto, RangeKey } from "@pea/shared";
import { Suspense, lazy, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import type { AssetComparisonSerie } from "../../../hooks/useAssetComparisonSeries";
import { formatMarketSessionHours, normalizeTimeZone } from "../../../lib/timezone";
import { ChartSkeleton } from "./DashboardSkeletons";

const PriceHistoryChart = lazy(() =>
  import("../../../components/charts/PriceHistoryChart").then((module) => ({ default: module.PriceHistoryChart }))
);

const PortfolioComparisonChart = lazy(() =>
  import("../../../components/charts/PortfolioComparisonChart").then((module) => ({ default: module.PortfolioComparisonChart }))
);

const fallbackIntradaySession: MarketSessionDto = {
  timezone: "Europe/Paris",
  city: "Paris",
  open: "09:00",
  close: "17:30",
  sessions: [{ open: "09:00", close: "17:30" }]
};

export const PortfolioChart = memo(function PortfolioChart({
  chart,
  range,
  userTimezone,
  comparisonSeries = [],
  comparisonLoading = false,
  isRefreshing = false
}: {
  chart: PortfolioChartDto;
  range: RangeKey;
  userTimezone?: string;
  comparisonSeries?: AssetComparisonSerie[];
  comparisonLoading?: boolean;
  isRefreshing?: boolean;
}) {
  const { t } = useTranslation(["dashboard"]);
  const prive = usePrivacy();
  const chartData = useMemo(() => toChartPoints(chart), [chart]);
  const marketSession = range === "1d" ? chart.marketSession ?? fallbackIntradaySession : undefined;
  const showComparison = comparisonSeries.length > 0;
  const waitingForComparison = comparisonLoading && !showComparison;
  const waitingForPortfolioChart = (comparisonLoading || showComparison) && chart.isPreparing;

  if (waitingForComparison || waitingForPortfolioChart) {
    return (
      <div>
        <p className="px-4 pb-1 text-xs text-slate-400">
          {waitingForPortfolioChart ? t("chart.preparing", { ns: "dashboard" }) : t("chart.loadingComparisons", { ns: "dashboard" })}
        </p>
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div className={isRefreshing ? "stale-refreshing rounded-md" : undefined}>
      {chart.isPreparing && (
        <p className="px-4 pb-2 text-xs text-amber">
          {chart.missingAssets?.length ? t("chart.preparingWithAssets", { assets: chart.missingAssets.join(", "), ns: "dashboard" }) : t("chart.preparing", { ns: "dashboard" })}
        </p>
      )}

      <Suspense fallback={<ChartSkeleton />}>
        {showComparison ? (
          <PortfolioComparisonChart
            chart={chart}
            comparisons={comparisonSeries.map((serie) => ({
              key: serie.symbol,
              label: serie.symbol,
              timestamps: serie.timestamps,
              prices: serie.prices
            }))}
            maskValues={prive}
            range={range}
            userTimezone={userTimezone}
          />
        ) : (
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
        )}
      </Suspense>

      {!showComparison && range === "1d" && marketSession && (marketSession.timezone !== normalizeTimeZone(userTimezone) || marketSession.sessions.length > 1) && (
        <p className="px-4 pt-2 text-xs text-slate-400">
          {t("chart.marketHours", { city: marketSession.city, hours: formatMarketSessionHours(marketSession.sessions), ns: "dashboard" })}
        </p>
      )}
    </div>
  );
});

function toChartPoints(chart: PortfolioChartDto) {
  return chart.timestamps.map((timestamp, index) => ({
    date: new Date(timestamp).toISOString(),
    value: chart.value[index] ?? null
  }));
}
