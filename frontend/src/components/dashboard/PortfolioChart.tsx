/**
 * Role du fichier : afficher le chart de portefeuille a partir du DTO compact
 * pre-calcule par le backend.
 *
 * Optimisations :
 * - React.memo evite les re-renders quand les props n'ont pas change.
 * - useMemo sur toChartPoints evite de recreer le tableau de points a chaque render du parent.
 * - PriceHistoryChart et PortfolioComparisonChart sont charges en lazy :
 *   recharts (~430 KB) ne bloque pas le bundle principal.
 *
 * Benchmark :
 * - Quand benchmark.data est disponible, on bascule vers PortfolioComparisonChart
 *   qui normalise les deux series en base 100 et affiche la courbe dorée.
 */

import type { MarketSessionDto, PortfolioChartDto, RangeKey } from "@pea/shared";
import { Suspense, lazy, memo, useMemo } from "react";
import { usePrivacy } from "../../contexts/PrivacyContext";
import { ChartSkeleton } from "./DashboardSkeletons";
import { formatMarketSessionHours, normalizeTimeZone } from "../../lib/timezone";
import type { BenchmarkResult } from "./benchmark/useBenchmarkChart";

const PriceHistoryChart = lazy(() =>
  import("../charts/PriceHistoryChart").then((module) => ({ default: module.PriceHistoryChart }))
);

const PortfolioComparisonChart = lazy(() =>
  import("../charts/PortfolioComparisonChart").then((module) => ({ default: module.PortfolioComparisonChart }))
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
  benchmark
}: {
  chart: PortfolioChartDto;
  range: RangeKey;
  userTimezone?: string;
  /** Résultat du hook useBenchmarkChart — absent si aucun benchmark sélectionné. */
  benchmark?: BenchmarkResult;
}) {
  const prive = usePrivacy();
  // Mémoïsé : la conversion tableau → points Recharts ne se refait que si chart change
  const chartData = useMemo(() => toChartPoints(chart), [chart]);
  const marketSession = range === "1d" ? chart.marketSession ?? fallbackIntradaySession : undefined;

  // On passe en mode comparaison uniquement si le benchmark a réellement des données —
  // une réponse vide (backend en rebuild) ne doit pas masquer le chart portefeuille.
  const showComparison = (benchmark?.data?.timestamps.length ?? 0) > 0;

  return (
    <div>
      {chart.isPreparing && (
        <p className="px-4 pb-2 text-xs text-amber">
          Donnees en cours de preparation{chart.missingAssets?.length ? `: ${chart.missingAssets.join(", ")}` : ""}
        </p>
      )}

      {/* Indicateur de chargement benchmark non bloquant */}
      {benchmark?.loading && !benchmark.data && (
        <p className="px-4 pb-1 text-xs text-slate-400">Chargement du benchmark…</p>
      )}

      {/* Erreur benchmark non bloquante — le chart portefeuille reste affiché */}
      {benchmark?.error && !benchmark.data && (
        <p className="px-4 pb-1 text-xs text-red-400">{benchmark.error}</p>
      )}

      <Suspense fallback={<ChartSkeleton />}>
        {showComparison ? (
          <PortfolioComparisonChart
            benchmark={benchmark!.data!}
            chart={chart}
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
          Horaires du marche : {marketSession.city} {formatMarketSessionHours(marketSession.sessions)}, heure locale du marche
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
