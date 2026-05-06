/**
 * Role du fichier : afficher le bloc d'evolution du portefeuille, puis liberer
 * les sections dependantes lorsque le chart est pret.
 */

import type { PortfolioChartDto, PortfolioSummary, SortDirection, User, WatchlistSortKey, RangeKey } from "@pea/shared";
import { useEffect, useState } from "react";
import { useAssetComparisonSeries, type ComparableAsset } from "../../hooks/useAssetComparisonSeries";
import type { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { isDataConstructionActive, notifyDataConstructionChanged } from "../../lib/dataConstruction";
import { PortfolioCalendarEvents } from "../common/AssetCalendarEvents";
import { CompareModal } from "../common/CompareModal";
import { ChartSkeleton, PositionsSectionSkeleton } from "./DashboardSkeletons";
import { PortfolioChart } from "./PortfolioChart";
import { PortfolioEvolutionHeader } from "./PortfolioEvolutionHeader";
import { PositionList } from "./PositionList";
import type { DashboardRangeSetter } from "./types";
import { WatchlistSection } from "./WatchlistSection";

export function PortfolioEvolutionSection({
  summary,
  range,
  defaultSortKey,
  defaultSortDirection,
  watchlistDefaultSortKey,
  watchlistDefaultSortDirection,
  setRange,
  portfolioChart,
  userTimezone,
  localPeaSearchEnabled
}: {
  summary: PortfolioSummary;
  range: RangeKey;
  defaultSortKey: User["dashboardDefaultSortKey"];
  defaultSortDirection: User["dashboardDefaultSortDirection"];
  watchlistDefaultSortKey: WatchlistSortKey;
  watchlistDefaultSortDirection: SortDirection;
  setRange: DashboardRangeSetter;
  portfolioChart: ReturnType<typeof useAsync<PortfolioChartDto>>;
  userTimezone: string;
  localPeaSearchEnabled: boolean;
}) {
  const chartReady = Boolean(portfolioChart.data) && !portfolioChart.loading;
  const portfolioChartReload = portfolioChart.reload;
  const portfolioChartPreparing = Boolean(portfolioChart.data?.isPreparing);
  const [comparing, setComparing] = useState(false);
  const [compareTargets, setCompareTargets] = useState<ComparableAsset[]>([]);
  const { series: comparisonSeries, loading: comparisonLoading } = useAssetComparisonSeries(compareTargets, range);

  function addCompareTarget(target: ComparableAsset) {
    setCompareTargets((prev) => (prev.some((item) => item.symbol === target.symbol) ? prev : [...prev, target]));
  }

  function removeCompareTarget(targetSymbol: string) {
    setCompareTargets((prev) => prev.filter((target) => target.symbol !== targetSymbol));
  }

  useEffect(() => {
    if (!portfolioChartPreparing) return;
    notifyDataConstructionChanged();
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      const status = await api.dataConstructionStatus().catch(() => null);
      if (cancelled) return;
      if (!isDataConstructionActive(status)) {
        await portfolioChartReload();
        return;
      }
      timer = window.setTimeout(poll, 2000);
    }

    timer = window.setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [portfolioChartPreparing, portfolioChartReload]);

  return (
    <>
      <section className="card p-0 sm:p-4">
        <PortfolioEvolutionHeader
          comparisonCount={compareTargets.length}
          onCompareClick={() => setComparing(true)}
          range={range}
          setRange={setRange}
        />
        {portfolioChart.loading || !portfolioChart.data ? (
          <ChartSkeleton />
        ) : (
          <PortfolioChart
            chart={portfolioChart.data}
            comparisonLoading={compareTargets.length > 0 && (comparisonLoading || portfolioChart.data.isPreparing)}
            comparisonSeries={comparisonSeries}
            range={range}
            userTimezone={userTimezone}
          />
        )}
      </section>

      <PortfolioCalendarEvents />

      {chartReady ? (
        <PositionList
          defaultSortDirection={defaultSortDirection}
          defaultSortKey={defaultSortKey}
          positions={summary.positions}
          range={range}
        />
      ) : (
        <PositionsSectionSkeleton count={Math.max(3, Math.min(summary.positions.length || 3, 6))} />
      )}

      {chartReady && <WatchlistSection defaultSortDirection={watchlistDefaultSortDirection} defaultSortKey={watchlistDefaultSortKey} range={range} />}

      {comparing && (
        <CompareModal
          currentSymbol="__PORTFOLIO__"
          localPeaSearchEnabled={localPeaSearchEnabled}
          onAdd={addCompareTarget}
          onClose={() => setComparing(false)}
          onRemove={removeCompareTarget}
          selected={compareTargets}
        />
      )}
    </>
  );
}
