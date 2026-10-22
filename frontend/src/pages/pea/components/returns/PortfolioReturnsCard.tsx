import type { PortfolioReturnsDto } from "@pea/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnnualReturnsChart, type AnnualReturn } from "../../../../components/charts/returns/AnnualReturnsChart";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { useAsync } from "../../../../hooks/useAsync";
import { api } from "../../../../lib/api";
import { cashMoney } from "../../../../lib/cash/cash-format";
import { formatMaybeDate, percent } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";
import { AnnualReturnsTable } from "./AnnualReturnsTable";

function Stat({ label, hint, value, sub, tone }: { label: string; hint?: string; value: string; sub?: string | undefined; tone?: number | undefined }) {
  const toneClass = tone === undefined ? "" : tone >= 0 ? "text-mint" : "text-coral";
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <p className="muted flex items-center gap-1 text-xs">
        <span>{label}</span>
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </p>
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      {sub ? <p className="muted text-xs">{sub}</p> : null}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="muted text-xs">{children}</p>;
}

/**
 * Rendement des titres pondéré par les dates d'achat : TRI annualisé depuis le premier achat et
 * rendement de chaque année civile, en graphique et en tableau.
 */
export function PortfolioReturnsCard() {
  const { t } = useTranslation("cash");
  const returns = useAsync((signal) => api.portfolioReturns(signal), undefined, { cacheKey: "portfolio-returns" });

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-1 font-semibold">
          <span>{t("returns.title")}</span>
          <InfoHint label={t("returns.title")}>{t("returns.hints.year")}</InfoHint>
        </h2>
        <p className="muted text-sm">{t("returns.description")}</p>
      </div>
      {returns.error ? <p className="text-sm text-coral">{returns.error}</p> : null}
      {!returns.data && !returns.error ? <p className="muted text-sm">{t("returns.loading")}</p> : null}
      {returns.data ? <ReturnsContent data={returns.data} /> : null}
    </section>
  );
}

function ReturnsContent({ data }: { data: PortfolioReturnsDto }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  if (!data.years.length) return <Note>{t("returns.empty")}</Note>;

  const chartData: AnnualReturn[] = data.years.flatMap((row) => row.returnPercent === undefined ? [] : [{
    year: row.year,
    value: row.returnPercent / 100,
    details: [t("returns.tooltipGain", { value: masquerValeur(cashMoney(row.gain), prive) }), ...(row.partial ? [t("returns.partial")] : [])]
  }]);
  const annualized = data.annualizedReturnPercent;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          hint={t("returns.hints.annualized")}
          label={t("returns.annualized")}
          sub={data.firstInvestmentAt ? t("returns.since", { date: formatMaybeDate(data.firstInvestmentAt) }) : undefined}
          tone={annualized}
          value={annualized === undefined ? t("returns.annualizedMissing") : t("returns.annualizedValue", { value: percent(annualized) })}
        />
        <Stat hint={t("returns.hints.totalGain")} label={t("returns.totalGain")} tone={data.totalGain} value={masquerValeur(cashMoney(data.totalGain), prive)} />
        <Stat label={t("returns.totalInvested")} value={masquerValeur(cashMoney(data.totalInvested), prive)} />
      </div>
      {chartData.length ? <AnnualReturnsChart data={chartData} /> : null}
      <AnnualReturnsTable years={data.years} />
      <div className="space-y-1">
        <Note>{t("returns.partialNote")}</Note>
        {data.isPreparing ? <Note>{t("returns.preparing")}</Note> : null}
        {data.missingPriceSymbols.length ? <Note>{t("returns.missingPrices", { symbols: data.missingPriceSymbols.join(", ") })}</Note> : null}
        {data.undatedSymbols.length ? <Note>{t("returns.undated", { symbols: data.undatedSymbols.join(", ") })}</Note> : null}
      </div>
    </>
  );
}
