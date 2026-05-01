/**
 * Role du fichier : orchestrer les donnees du Dashboard et deleguer l'affichage
 * aux composants specialises du dossier components/dashboard.
 */

import type { RangeKey, User } from "@pea/shared";
import { useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { PortfolioEvolutionSection } from "../components/dashboard/PortfolioEvolutionSection";
import { PortfolioEvolutionSkeleton } from "../components/dashboard/DashboardSkeletons";
import { TopMetrics } from "../components/dashboard/TopMetrics";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";

export function DashboardPage({ user, appTimezone }: { user: User; appTimezone: string }) {
  const [selectedRange, setSelectedRangeState] = useState<RangeKey>(() => {
    const initialRange = user.defaultChartRange ?? "1d";
    return initialRange;
  });
  const portfolio = useAsync((signal) => api.portfolio(selectedRange, signal), [selectedRange]);
  const portfolioChart = useAsync((signal) => api.portfolioChart(selectedRange, signal), [selectedRange]);

  /**
   * Met a jour la range affichee pour tous les blocs dependants du temps.
   *
   * @param source Origine de l'action, conservee pour instrumentation future.
   * @param nextRange Nouvelle range demandee.
   * @returns Rien.
   */
  function setSelectedRange(source: string, nextRange: RangeKey) {
    setSelectedRangeState((previousRange) => {
      void source;
      if (previousRange === nextRange) return previousRange;
      return nextRange;
    });
  }

  const summary = portfolio.data;
  const portfolioIsEmpty = !portfolio.loading && summary != null && summary.positions.length === 0;

  if (portfolio.error) return <div className="card border-coral p-6 text-coral">{portfolio.error}</div>;
  if (portfolioIsEmpty) return <EmptyState />;

  return (
    <div className="space-y-6">
      <TopMetrics
        chart={portfolioChart.data}
        chartLoading={portfolioChart.loading}
        loading={portfolio.loading || !summary}
        range={selectedRange}
        summary={summary}
      />

      {summary ? (
        <PortfolioEvolutionSection
          defaultSortDirection={user.dashboardDefaultSortDirection}
          defaultSortKey={user.dashboardDefaultSortKey}
          range={selectedRange}
          setRange={setSelectedRange}
          summary={summary}
          portfolioChart={portfolioChart}
          userTimezone={appTimezone}
        />
      ) : (
        <PortfolioEvolutionSkeleton range={selectedRange} setRange={setSelectedRange} />
      )}
    </div>
  );
}
