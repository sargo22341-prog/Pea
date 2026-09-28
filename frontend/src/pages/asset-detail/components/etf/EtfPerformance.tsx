import type { AssetFundDetails, AssetFundTrailingReturns } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import type { MetricItem } from "../../../../components/common/metrics/metric-items";
import { formatMaybeDate } from "../../../../lib/format";
import { formatFractionPercent, formatRatio } from "../../../../lib/format-metrics";
import { toneFromNumber } from "../../../../utils/assetTone";
import { EtfAnnualReturnsChart } from "./EtfAnnualReturnsChart";

const RETURN_PERIODS = ["ytd", "oneYear", "threeYear", "fiveYear", "tenYear"] as const satisfies readonly (keyof AssetFundTrailingReturns)[];

function returnValue(value: number | undefined) {
  return value === undefined ? undefined : formatFractionPercent(value, { signed: true });
}

/** Onglet « Performance » d'un ETF : rendements glissants, années civiles et risque sur 3 ans. */
export function EtfPerformance({ data }: { data: AssetFundDetails }) {
  const { t } = useTranslation("asset");
  const returns = data.trailingReturns;
  const risk = data.risk;
  const returnItems: MetricItem[] = RETURN_PERIODS.map((period) => ({
    key: period,
    label: t(`etf.returns.${period}`),
    value: returnValue(returns?.[period]),
    tone: toneFromNumber(returns?.[period])
  }));
  const riskItems: MetricItem[] = (["volatility", "sharpe", "beta", "alpha", "rSquared"] as const).map((key) => ({
    key,
    label: t(`etf.risk.${key}`),
    value: risk?.[key] === undefined ? undefined : key === "sharpe" || key === "beta" ? formatRatio(risk[key]) : formatFractionPercent(risk[key], { digits: key === "alpha" ? 2 : 1 }),
    hint: t(`etf.risk.${key}Hint`)
  }));

  return (
    <section className="card space-y-2 p-4">
      <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
        {t("etf.returns.title")}
        <InfoHint label={t("etf.returns.title")}>{t("etf.returns.hint")}</InfoHint>
      </h2>
      {returns?.asOfDate ? <p className="text-xs text-slate-500">{t("etf.returns.asOf", { date: formatMaybeDate(returns.asOfDate) })}</p> : null}
      <MetricGrid columnsClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" items={returnItems} minVisible={1} />
      {data.annualReturns?.length ? (
        <DetailsToggle label={t("etf.returns.byYear")} storageKey="etf-annual-returns">
          <EtfAnnualReturnsChart data={data.annualReturns} />
        </DetailsToggle>
      ) : null}
      {risk ? (
        <DetailsToggle label={t("etf.risk.title")} storageKey="etf-risk">
          <MetricGrid columnsClassName="grid-cols-2 lg:grid-cols-5" items={riskItems} minVisible={1} />
        </DetailsToggle>
      ) : null}
    </section>
  );
}
