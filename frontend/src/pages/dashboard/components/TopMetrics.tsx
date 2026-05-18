import type { PortfolioChartDto, PortfolioSummary, RangeKey } from "@pea/shared";
import { Activity, Coins, LineChart, ReceiptText, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import { formatRangeLabel, money, percent } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { Metric } from "./Metric";

export function TopMetrics({
  summary,
  range,
  loading,
  chart,
  chartLoading
}: {
  summary: PortfolioSummary | null;
  range: RangeKey;
  loading: boolean;
  chart: PortfolioChartDto | null;
  chartLoading: boolean;
}) {
  const { t } = useTranslation(["dashboard"]);
  const prive = usePrivacy();

  return (
    <section className="space-y-3">
      <PortfolioTotal loading={loading} prive={prive} value={summary?.totalValue} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric icon={TrendingUp} label={t("topMetrics.invested", { ns: "dashboard" })} loading={loading} value={summary ? masquerValeur(money(summary.totalCost, summary.currency), prive) : undefined} />
        <Metric icon={Coins} label={t("topMetrics.dividends", { ns: "dashboard" })} loading={loading} value={summary ? masquerValeur(money(summary.totalDividendsReceived, summary.currency), prive) : undefined} />
        <Metric icon={ReceiptText} label={t("topMetrics.fees", { ns: "dashboard" })} loading={loading} value={summary ? masquerValeur(money(summary.totalFees, summary.currency), prive) : undefined} />
        <Metric
          icon={LineChart}
          label={t("metrics.performance", { ns: "dashboard" })}
          loading={loading}
          tone={summary == null ? undefined : summary.totalPerformance >= 0 ? "positive" : "negative"}
          value={summary ? masquerValeur(`${money(summary.totalPerformance, summary.currency)} (${percent(summary.totalPerformancePercent)})`, prive) : undefined}
        />
        <RangeMetric chart={chart} chartLoading={chartLoading} currency={summary?.currency ?? "EUR"} prive={prive} range={range} summaryReady={!loading && summary != null} />
      </div>
    </section>
  );
}

/**
 * Affiche la valorisation du PEA comme information principale du Dashboard.
 */
function PortfolioTotal({ value, loading, prive }: { value?: number; loading: boolean; prive: boolean }) {
  return (
    <div className="flex min-h-[118px] items-start justify-center pt-2 text-center">
      {loading ? (
        <div className="mt-2 h-[70px] w-72 max-w-full animate-pulse rounded bg-panel2/60 sm:h-[86px]" />
      ) : (
        <p
          className="break-words bg-gradient-to-b from-white via-slate-100 to-teal-100 bg-clip-text font-black leading-none text-transparent text-[70px] sm:text-[86px]"
          style={{ textShadow: "0 0 28px rgba(45, 212, 191, 0.18)" }}
        >
          {prive ? "••••" : formatMainTotal(value)}
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
 * Attend la synthese principale avant d'afficher la performance de range.
 */
function RangeMetric({
  currency,
  range,
  summaryReady,
  chart,
  chartLoading,
  prive
}: {
  currency: string;
  range: RangeKey;
  summaryReady: boolean;
  chart: PortfolioChartDto | null;
  chartLoading: boolean;
  prive: boolean;
}) {
  const { t } = useTranslation(["dashboard"]);
  const label = t("topMetrics.rangePerformance", { ns: "dashboard", range: formatRangeLabel(range) });
  if (!summaryReady) {
    return <Metric icon={Activity} label={label} loading />;
  }
  return <LoadedRangeMetric chart={chart} chartLoading={chartLoading} currency={currency} label={label} prive={prive} />;
}

/**
 * Affiche la metrique de performance une fois le chart portefeuille disponible.
 */
function LoadedRangeMetric({
  currency,
  chart,
  chartLoading,
  label,
  prive
}: {
  currency: string;
  chart: PortfolioChartDto | null;
  chartLoading: boolean;
  label: string;
  prive: boolean;
}) {
  return (
    <Metric
      icon={Activity}
      label={label}
      loading={chartLoading || !chart}
      tone={chart == null ? undefined : chart.performanceEuro >= 0 ? "positive" : "negative"}
      value={chart ? masquerValeur(`${money(chart.performanceEuro, currency)} · ${percent(chart.performancePercent)}`, prive) : undefined}
    />
  );
}
