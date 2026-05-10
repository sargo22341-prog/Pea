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

const lazyChartRetryCooldownMs = 60_000;
const lazyChartRefreshTimeoutMs = 45_000;

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
  const [portfolioChartRefreshing, setPortfolioChartRefreshing] = useState(false);
  const lazyChartGuard = useRef({
    requestedForCacheVersion: "",
    lastRefreshRequestedAt: 0,
    refreshInProgress: false,
    suppressUntil: 0,
    timeout: undefined as number | undefined
  });

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

    function onMarketEvent(event: Event) {
      const payload = (event as CustomEvent<{ type?: string }>).detail;
      if (payload.type === "portfolio-chart-refresh-started") {
        lazyChartGuard.current.refreshInProgress = true;
        setPortfolioChartRefreshing(true);
      }
      if (payload.type === "portfolio-chart-updated" || payload.type === "dashboard-chart-updated") {
        const guard = lazyChartGuard.current;
        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setPortfolioChartRefreshing(false);
      }
      if (payload.type === "market-snapshot-updated" || payload.type === "portfolio-market-updated" || payload.type === "portfolio-assets-updated" || payload.type === "portfolio-chart-updated" || payload.type === "dashboard-chart-updated") scheduleReload();
    }

    window.addEventListener("pea:market-event", onMarketEvent);
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.removeEventListener("pea:market-event", onMarketEvent);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [portfolioReload]);

  useEffect(() => {
    if (selectedRange !== "1d" || !portfolioFull.data || !chart) return;
    const cacheVersion = chartCacheVersion(chart);
    const guard = lazyChartGuard.current;
    const now = Date.now();
    if (guard.refreshInProgress || now < guard.suppressUntil) return;
    if (guard.requestedForCacheVersion === cacheVersion && now - guard.lastRefreshRequestedAt < lazyChartRetryCooldownMs) return;

    guard.requestedForCacheVersion = cacheVersion;
    guard.lastRefreshRequestedAt = now;

    api.requestChartRefresh({ scope: "portfolio", range: "1d" })
      .then((result) => {
        if (result.status === "started" || result.status === "in-progress") {
          guard.refreshInProgress = true;
          setPortfolioChartRefreshing(true);
          if (guard.timeout) window.clearTimeout(guard.timeout);
          guard.timeout = window.setTimeout(() => {
            guard.refreshInProgress = false;
            guard.timeout = undefined;
            setPortfolioChartRefreshing(false);
          }, lazyChartRefreshTimeoutMs);
          return;
        }

        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setPortfolioChartRefreshing(false);
      })
      .catch(() => {
        guard.refreshInProgress = false;
        guard.lastRefreshRequestedAt = Date.now();
        setPortfolioChartRefreshing(false);
      });
  }, [chart, portfolioFull.data, selectedRange]);

  useEffect(() => {
    const guard = lazyChartGuard.current;
    return () => {
      const timeout = guard.timeout;
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

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
          portfolioChartRefreshing={portfolioChartRefreshing}
          localPeaSearchEnabled={user.localPeaSearchEnabled}
          userTimezone={appTimezone}
        />
      ) : (
        <PortfolioEvolutionSkeleton range={selectedRange} setRange={setSelectedRange} />
      )}

      
    </div>
  );
}

function chartCacheVersion(chart: { timestamps: number[]; baselineDatetime?: string }) {
  const lastTimestamp = chart.timestamps[chart.timestamps.length - 1] ?? "none";
  return `${chart.timestamps.length}:${lastTimestamp}:${chart.baselineDatetime ?? ""}`;
}
