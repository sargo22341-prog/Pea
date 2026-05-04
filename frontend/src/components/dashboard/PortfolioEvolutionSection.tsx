/**
 * Role du fichier : afficher le bloc d'evolution du portefeuille, puis liberer
 * les sections dependantes lorsque le chart est pret.
 * Gère aussi l'état du benchmark actif et orchestre le fetch des données d'indice.
 */

import type { PortfolioChartDto, PortfolioSummary, RangeKey, User } from "@pea/shared";
import { useEffect, useState } from "react";
import type { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { isDataConstructionActive, notifyDataConstructionChanged } from "../../lib/dataConstruction";
import { ChartSkeleton, PositionsSectionSkeleton } from "./DashboardSkeletons";
import { useBenchmarkChart } from "./benchmark/useBenchmarkChart";
import type { BenchmarkKey } from "./benchmark/benchmarks.config";
import { PortfolioChart } from "./PortfolioChart";
import { PortfolioEvolutionHeader } from "./PortfolioEvolutionHeader";
import { PositionList } from "./PositionList";
import type { DashboardRangeSetter } from "./types";
import { WatchlistSection } from "./WatchlistSection";
import { PortfolioCalendarEvents } from "../common/AssetCalendarEvents";


export function PortfolioEvolutionSection({
  summary,
  range,
  defaultSortKey,
  defaultSortDirection,
  setRange,
  portfolioChart,
  userTimezone
}: {
  summary: PortfolioSummary;
  range: RangeKey;
  defaultSortKey: User["dashboardDefaultSortKey"];
  defaultSortDirection: User["dashboardDefaultSortDirection"];
  setRange: DashboardRangeSetter;
  portfolioChart: ReturnType<typeof useAsync<PortfolioChartDto>>;
  userTimezone: string;
}) {
  const chartReady = Boolean(portfolioChart.data) && !portfolioChart.loading;
  const portfolioChartReload = portfolioChart.reload;
  const portfolioChartPreparing = Boolean(portfolioChart.data?.isPreparing);

  // Benchmark sélectionné — conservé lors des changements de range
  const [activeBenchmark, setActiveBenchmark] = useState<BenchmarkKey | null>(null);

  // Données de l'indice de référence (fetch + cache automatique)
  const benchmarkResult = useBenchmarkChart(activeBenchmark, range);

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
          activeBenchmark={activeBenchmark}
          onBenchmarkChange={setActiveBenchmark}
          range={range}
          setRange={setRange}
        />
        {portfolioChart.loading || !portfolioChart.data ? (
          <ChartSkeleton />
        ) : (
          <PortfolioChart
            benchmark={benchmarkResult}
            chart={portfolioChart.data}
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

      {chartReady && <WatchlistSection range={range} />}
    </>
  );
}
