/**
 * Role du fichier : orchestrer les donnees du Dashboard et deleguer l'affichage
 * aux composants specialises du dossier components/dashboard.
 * L'appel a /api/portfolio/full regroupe summary + chart en un seul aller-retour reseau.
 */

import type { RangeKey, User } from "@pea/shared";
import { useCallback, useState } from "react";
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

  // Un seul appel réseau remplace les deux appels /portfolio et /portfolio/chart distincts.
  const portfolioFull = useAsync((signal) => api.portfolioFull(selectedRange, signal), [selectedRange]);
  const summary = portfolioFull.data?.summary ?? null;
  const chart = portfolioFull.data?.chart ?? null;

  /**
   * Met a jour la range affichee pour tous les blocs dependants du temps.
   * useCallback stabilise la reference de la fonction : les composants enfants
   * qui recoivent setSelectedRange en prop ne re-rendent pas si la range n'a pas change.
   *
   * @param source Origine de l'action, conservee pour instrumentation future.
   * @param nextRange Nouvelle range demandee.
   */
  const setSelectedRange = useCallback((source: string, nextRange: RangeKey) => {
    setSelectedRangeState((previousRange) => {
      void source;
      if (previousRange === nextRange) return previousRange;
      return nextRange;
    });
  }, []);

  const portfolioIsEmpty = !portfolioFull.loading && summary != null && summary.positions.length === 0;

  if (portfolioFull.error) return <div className="card border-coral p-6 text-coral">{portfolioFull.error}</div>;
  if (portfolioIsEmpty) return <EmptyState />;

  return (
    <div className="space-y-6">
      <TopMetrics
        chart={chart}
        chartLoading={portfolioFull.loading}
        loading={portfolioFull.loading || !summary}
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
          portfolioChart={{ loading: portfolioFull.loading, data: chart, error: portfolioFull.error, reload: portfolioFull.reload }}
          userTimezone={appTimezone}
        />
      ) : (
        <PortfolioEvolutionSkeleton range={selectedRange} setRange={setSelectedRange} />
      )}

      
    </div>
  );
}
