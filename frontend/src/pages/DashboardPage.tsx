/**
 * Rôle du fichier : afficher le Dashboard avec un chargement progressif par
 * priorité pour éviter les blocages globaux et les sauts de layout.
 */

import type { PortfolioSummary, RangeKey, User } from "@pea/shared";
import { Activity, LineChart, ReceiptText, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PortfolioChart } from "../components/PortfolioChart";
import { PositionList } from "../components/PositionList";
import { RangeSelector } from "../components/RangeSelector";
import { WatchlistSection } from "../components/WatchlistSection";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { isDataConstructionActive, notifyDataConstructionChanged } from "../lib/dataConstruction";
import { formatRangeLabel, money, percent } from "../lib/format";

export function DashboardPage({ user, appTimezone }: { user: User; appTimezone: string }) {
  const [selectedRange, setSelectedRangeState] = useState<RangeKey>(() => {
    const initialRange = user.defaultChartRange ?? "1d";
    return initialRange;
  });
  const portfolio = useAsync((signal) => api.portfolio(selectedRange, signal), [selectedRange]);

  /**
   * Met à jour la range affichée pour tous les blocs dépendants du temps.
   *
   * @param source Origine de l'action, conservée pour instrumentation future.
   * @param nextRange Nouvelle range demandée.
   * @returns Rien.
   */
  function setSelectedRange(source: string, nextRange: RangeKey) {
    setSelectedRangeState((previousRange) => {
      void source;
      void previousRange;
      return nextRange;
    });
  }

  const summary = portfolio.data;
  const portfolioIsEmpty = !portfolio.loading && summary != null && summary.positions.length === 0;

  if (portfolio.error) return <div className="card border-coral p-6 text-coral">{portfolio.error}</div>;
  if (portfolioIsEmpty) return <EmptyState />;

  return (
    <div className="space-y-6">
      <TopMetrics loading={portfolio.loading || !summary} range={selectedRange} summary={summary} />

      {summary ? (
        <PortfolioEvolutionSection
          defaultSortDirection={user.dashboardDefaultSortDirection}
          defaultSortKey={user.dashboardDefaultSortKey}
          range={selectedRange}
          setRange={setSelectedRange}
          summary={summary}
          userTimezone={appTimezone}
        />
      ) : (
        <PortfolioEvolutionSkeleton range={selectedRange} setRange={setSelectedRange} />
      )}
    </div>
  );
}

/**
 * Affiche les métriques prioritaires du haut de page.
 *
 * @param props Résumé éventuel, range et état de chargement.
 * @returns Grille de quatre métriques avec skeletons stables.
 */
function TopMetrics({ summary, range, loading }: { summary: PortfolioSummary | null; range: RangeKey; loading: boolean }) {
  return (
    <section className="space-y-3">
      <PortfolioTotal loading={loading} value={summary?.totalValue} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={TrendingUp} label="Total investi" loading={loading} value={summary ? money(summary.totalCost, summary.currency) : undefined} />
        <Metric icon={ReceiptText} label="Total frais" loading={loading} value={summary ? money(summary.totalFees, summary.currency) : undefined} />
        <Metric
          icon={LineChart}
          label="Performance"
          loading={loading}
          tone={summary == null ? undefined : summary.totalPerformance >= 0 ? "positive" : "negative"}
          value={summary ? `${money(summary.totalPerformance, summary.currency)} (${percent(summary.totalPerformancePercent)})` : undefined}
        />
        <RangeMetric currency={summary?.currency ?? "EUR"} range={range} summaryReady={!loading && summary != null} />
      </div>
    </section>
  );
}

/**
 * Affiche la valorisation du PEA comme information principale du Dashboard.
 *
 * @param props Valeur formatée et état de chargement.
 * @returns Grand bloc sans libellé visible.
 */
function PortfolioTotal({ value, loading }: { value?: number; loading: boolean }) {
  return (
    <div className="flex min-h-[118px] items-start justify-center pt-2 text-center">
      {loading ? (
        <div className="mt-2 h-[70px] w-72 max-w-full animate-pulse rounded bg-panel2/60 sm:h-[86px]" />
      ) : (
        <p
          className="break-words bg-gradient-to-b from-white via-slate-100 to-teal-100 bg-clip-text font-black leading-none text-transparent text-[70px] sm:text-[86px]"
          style={{ textShadow: "0 0 28px rgba(45, 212, 191, 0.18)" }}
        >
          {formatMainTotal(value)}
        </p>
      )}
    </div>
  );
}

function formatMainTotal(value?: number) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: safeValue > 1000 ? 0 : 2
  }).format(safeValue);
}

/**
 * Charge la performance de range seulement après la synthèse principale.
 *
 * @param props Devise, range et disponibilité du résumé.
 * @returns Tuile de performance de range.
 */
function RangeMetric({ currency, range, summaryReady }: { currency: string; range: RangeKey; summaryReady: boolean }) {
  if (!summaryReady) {
    return <Metric icon={Activity} label={`Performance sur ${formatRangeLabel(range)}`} loading />;
  }
  return <LoadedRangeMetric currency={currency} range={range} />;
}

/**
 * Appelle le chart portefeuille pour afficher la performance de range.
 *
 * @param props Devise et range.
 * @returns Tuile chargée ou skeleton dédié.
 */
function LoadedRangeMetric({ currency, range }: { currency: string; range: RangeKey }) {
  const portfolioChart = useAsync((signal) => api.portfolioChart(range, signal), [range]);
  return (
    <Metric
      icon={Activity}
      label={`Performance sur ${formatRangeLabel(range)}`}
      loading={portfolioChart.loading || !portfolioChart.data}
      tone={portfolioChart.data == null ? undefined : portfolioChart.data.performanceEuro >= 0 ? "positive" : "negative"}
      value={
        portfolioChart.data
          ? `${money(portfolioChart.data.performanceEuro, currency)} · ${percent(portfolioChart.data.performancePercent)}`
          : undefined
      }
    />
  );
}

/**
 * Charge puis affiche le bloc d'évolution du portefeuille avant de libérer les positions.
 *
 * @param props Résumé portefeuille, range et setter de range.
 * @returns Bloc chart puis positions lazy quand le chart est disponible.
 */
function PortfolioEvolutionSection({
  summary,
  range,
  defaultSortKey,
  defaultSortDirection,
  setRange,
  userTimezone
}: {
  summary: PortfolioSummary;
  range: RangeKey;
  defaultSortKey: User["dashboardDefaultSortKey"];
  defaultSortDirection: User["dashboardDefaultSortDirection"];
  setRange: (source: string, nextRange: RangeKey) => void;
  userTimezone: string;
}) {
  const portfolioChart = useAsync((signal) => api.portfolioChart(range, signal), [range]);
  const chartReady = Boolean(portfolioChart.data) && !portfolioChart.loading;
  const portfolioChartReload = portfolioChart.reload;
  const portfolioChartPreparing = Boolean(portfolioChart.data?.isPreparing);

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
        <div className="flex min-h-[76px] flex-col justify-between gap-4 px-2 pb-3 sm:flex-row sm:items-center sm:px-0 sm:pb-0">
          <div>
            <h1 className="text-xl font-bold">Evolution du portefeuille</h1>
            <p className="muted">Valorisation agregee depuis les historiques Yahoo Finance.</p>
          </div>
          <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
        </div>
        {portfolioChart.loading || !portfolioChart.data ? (
          <ChartSkeleton />
        ) : (
          <PortfolioChart chart={portfolioChart.data} range={range} userTimezone={userTimezone} />
        )}
      </section>

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

/**
 * Réserve l'espace du bloc chart tant que la synthèse n'est pas disponible.
 *
 * @param props Range courante et setter de range.
 * @returns Bloc chart skeleton complet.
 */
function PortfolioEvolutionSkeleton({
  range,
  setRange
}: {
  range: RangeKey;
  setRange: (source: string, nextRange: RangeKey) => void;
}) {
  return (
    <section className="card p-0 sm:p-4">
      <div className="flex min-h-[76px] flex-col justify-between gap-4 px-2 pb-3 sm:flex-row sm:items-center sm:px-0 sm:pb-0">
        <div>
          <h1 className="text-xl font-bold">Evolution du portefeuille</h1>
          <p className="muted">Valorisation agregee depuis les historiques Yahoo Finance.</p>
        </div>
        <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
      </div>
      <ChartSkeleton />
    </section>
  );
}

/**
 * Affiche un placeholder stable pour un chart.
 *
 * @returns Skeleton de chart à hauteur fixe.
 */
function ChartSkeleton() {
  return (
    <div className="h-72 p-4">
      <div className="relative h-full overflow-hidden rounded-md border border-line bg-ink">
        <div className="absolute inset-x-4 bottom-8 top-6 animate-pulse rounded bg-panel2/70" />
        <div className="absolute bottom-8 left-4 right-4 h-px bg-line" />
      </div>
    </div>
  );
}

/**
 * Réserve la section positions avant que le chart soit terminé.
 *
 * @param props Nombre de lignes skeleton à afficher.
 * @returns Carte positions avec lignes placeholder.
 */
function PositionsSectionSkeleton({ count }: { count: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex min-h-[77px] items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="font-semibold">Positions</h2>
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-panel2" />
        </div>
        <div className="h-9 w-20 animate-pulse rounded-md bg-panel2" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: count }).map((_, index) => (
          <div className="min-h-[76px] p-3 sm:min-h-[88px] sm:p-4" key={index}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-md bg-panel2" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full animate-pulse rounded bg-panel2" />
                <div className="h-3 w-20 animate-pulse rounded bg-panel2" />
              </div>
              <div className="min-w-[92px] space-y-2">
                <div className="ml-auto h-3 w-20 animate-pulse rounded bg-panel2" />
                <div className="ml-auto h-3 w-16 animate-pulse rounded bg-panel2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Affiche un indicateur synthétique du portefeuille.
 *
 * @param props Icône, libellé, valeur et tonalité visuelle.
 * @returns Tuile de métrique prête à afficher.
 */
function Metric({
  icon: Icon,
  label,
  value,
  tone,
  loading = false
}: {
  icon: typeof TrendingUp;
  label: string;
  value?: string;
  tone?: "positive" | "negative";
  loading?: boolean;
}) {
  return (
    <div className="card min-h-[112px] min-w-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="muted truncate">{label}</p>
        <Icon className="shrink-0 text-sky" size={20} />
      </div>
      {loading ? (
        <div className="h-6 w-28 max-w-full animate-pulse rounded bg-panel2 sm:h-7" />
      ) : (
        <p className={`break-words text-lg font-bold sm:text-xl ${tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}
