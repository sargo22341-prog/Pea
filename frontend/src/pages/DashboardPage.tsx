/**
 * Role du fichier : orchestrer les donnees du Dashboard et deleguer l'affichage
 * aux composants specialises du dossier components/dashboard.
 * L'appel a /api/portfolio/full regroupe summary + chart en un seul aller-retour reseau.
 */

import type { RangeKey, User } from "@pea/shared";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const portfolioReload = portfolioFull.reload;
  const lastAutoReloadAt = useRef(0);

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

  useEffect(() => {
    let eventSource: EventSource | undefined;
    let cancelled = false;
    let debounceTimer: number | undefined;

    function reloadVisiblePortfolio() {
      const now = Date.now();
      if (now - lastAutoReloadAt.current < 1500) return;
      lastAutoReloadAt.current = now;
      void portfolioReload();
    }

    function scheduleReload() {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(reloadVisiblePortfolio, 400);
    }

    function onForeground() {
      if (document.visibilityState === "visible") reloadVisiblePortfolio();
    }

    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);

    api.marketFeatures()
      .then((features) => {
        if (cancelled || !features.sseEnabled) return;
        eventSource = new EventSource(api.marketEventsUrl(), { withCredentials: true });
        for (const eventName of ["market-snapshot-updated", "portfolio-market-updated", "portfolio-assets-updated", "portfolio-chart-updated", "dashboard-chart-updated", "watchlist-market-updated", "watchlist-assets-updated", "watchlist-chart-updated", "analysis-updated", "dividends-updated", "scheduler-health-updated"]) {
          eventSource.addEventListener(eventName, (event) => {
            const payload = JSON.parse((event as MessageEvent).data);
            window.dispatchEvent(new CustomEvent("pea:market-event", { detail: payload }));
            if (payload.type === "market-snapshot-updated" || payload.type === "portfolio-market-updated" || payload.type === "portfolio-assets-updated" || payload.type === "portfolio-chart-updated" || payload.type === "dashboard-chart-updated") scheduleReload();
          });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
      eventSource?.close();
    };
  }, [portfolioReload]);

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
          watchlistDefaultSortDirection={user.watchlistDefaultSortDirection}
          watchlistDefaultSortKey={user.watchlistDefaultSortKey}
          range={selectedRange}
          setRange={setSelectedRange}
          summary={summary}
          portfolioChart={{ loading: portfolioFull.loading, data: chart, error: portfolioFull.error, reload: portfolioFull.reload }}
          localPeaSearchEnabled={user.localPeaSearchEnabled}
          userTimezone={appTimezone}
        />
      ) : (
        <PortfolioEvolutionSkeleton range={selectedRange} setRange={setSelectedRange} />
      )}

      
    </div>
  );
}
