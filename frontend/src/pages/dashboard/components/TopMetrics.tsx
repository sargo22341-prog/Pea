import type { PortfolioChartDto, PortfolioSummary, RangeKey } from "@pea/shared";
import { Activity, ArrowDownToLine, ChevronRight, Coins, LineChart, TrendingUp, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { usePrivacy } from "../../../contexts/privacy-context";
import { formatRangeLabel, money, percent } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { Metric } from "./Metric";

/**
 * Synthèse de la page d'accueil : valeur du PEA et quatre indicateurs essentiels. Le détail
 * (flux, plafond, plus-values, frais, dividendes) est regroupé sur la page « Mon PEA ».
 */
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
  const currency = summary?.currency ?? "EUR";
  // Compte espèces configuré : valeur et performance du PEA entier ; sinon, celles des positions.
  const pea = summary?.pea?.status === "ready" ? summary.pea : undefined;

  return (
    <section className="space-y-3">
      <PortfolioTotal loading={loading} prive={prive} value={pea ? pea.totalValue : summary?.totalValue} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {pea ? (
          <>
            <Metric
              icon={LineChart}
              hint={t("topMetrics.hints.globalGain", { ns: "dashboard" })}
              label={t("topMetrics.globalGain", { ns: "dashboard" })}
              tone={pea.globalGain >= 0 ? "positive" : "negative"}
              value={masquerValeur(pea.simpleReturnPercent === undefined ? money(pea.globalGain, currency) : `${money(pea.globalGain, currency)} (${percent(pea.simpleReturnPercent)})`, prive)}
            />
            <RangeMetric chart={chart} chartLoading={chartLoading} currency={currency} prive={prive} range={range} summaryReady={!loading} />
            <Metric hint={t("topMetrics.hints.cash", { ns: "dashboard" })} icon={Wallet} label={t("topMetrics.cash", { ns: "dashboard" })} value={masquerValeur(money(pea.cash, currency), prive)} />
            <Metric hint={t("topMetrics.hints.deposits", { ns: "dashboard" })} icon={ArrowDownToLine} label={t("topMetrics.deposits", { ns: "dashboard" })} value={masquerValeur(money(pea.deposits, currency), prive)} />
          </>
        ) : (
          <>
            <Metric
              icon={LineChart}
              hint={t("topMetrics.hints.performance", { ns: "dashboard" })}
              label={t("metrics.performance", { ns: "dashboard" })}
              loading={loading}
              tone={summary == null ? undefined : summary.totalPerformance >= 0 ? "positive" : "negative"}
              value={summary ? masquerValeur(`${money(summary.totalPerformance, currency)} (${percent(summary.totalPerformancePercent)})`, prive) : undefined}
            />
            <RangeMetric chart={chart} chartLoading={chartLoading} currency={currency} prive={prive} range={range} summaryReady={!loading && summary != null} />
            <Metric hint={t("topMetrics.hints.invested", { ns: "dashboard" })} icon={TrendingUp} label={t("topMetrics.invested", { ns: "dashboard" })} loading={loading} value={summary ? masquerValeur(money(summary.totalCost, currency), prive) : undefined} />
            <Metric hint={t("topMetrics.hints.dividends", { ns: "dashboard" })} icon={Coins} label={t("topMetrics.dividends", { ns: "dashboard" })} loading={loading} value={summary ? masquerValeur(money(summary.totalDividendsReceived, currency), prive) : undefined} />
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Link className="btn-ghost text-sm" to="/pea">
          {t("topMetrics.myPea", { ns: "dashboard" })}
          <ChevronRight size={16} />
        </Link>
      </div>
    </section>
  );
}

/**
 * Affiche la valorisation du PEA comme information principale du Dashboard.
 */
function PortfolioTotal({ value, loading, prive }: { value?: number | undefined; loading: boolean; prive: boolean }) {
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
  const hint = t("topMetrics.hints.range", { ns: "dashboard" });
  if (!summaryReady) {
    return <Metric hint={hint} icon={Activity} label={label} loading />;
  }
  return <LoadedRangeMetric chart={chart} chartLoading={chartLoading} currency={currency} hint={hint} label={label} prive={prive} />;
}

/**
 * Affiche la metrique de performance une fois le chart portefeuille disponible.
 */
function LoadedRangeMetric({
  currency,
  chart,
  chartLoading,
  hint,
  label,
  prive
}: {
  currency: string;
  chart: PortfolioChartDto | null;
  chartLoading: boolean;
  hint: string;
  label: string;
  prive: boolean;
}) {
  return (
    <Metric
      hint={hint}
      icon={Activity}
      label={label}
      loading={chartLoading || !chart}
      tone={chart == null ? undefined : chart.performanceEuro >= 0 ? "positive" : "negative"}
      value={chart ? masquerValeur(`${money(chart.performanceEuro, currency)} · ${percent(chart.performancePercent)}`, prive) : undefined}
    />
  );
}
