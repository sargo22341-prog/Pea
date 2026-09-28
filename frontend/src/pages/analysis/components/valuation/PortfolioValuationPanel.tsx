import type { PortfolioValuation, WeightedPortfolioMetric } from "@pea/shared";
import { isMeaningfulMultiple } from "@pea/shared";
import { Activity, Percent, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import { AssetIcon } from "../../../../components/common/AssetIcon";
import { formatPercent } from "../../../../components/charts/chartFormat";
import { formatFractionPercent, formatRatio, MISSING_VALUE } from "../../../../lib/format-metrics";

/** Une valeur pondérée n'est affichée que si elle a pu être calculée sur au moins une ligne. */
function metricValue(metric: WeightedPortfolioMetric, format: (value: number) => string) {
  return metric.value === undefined ? undefined : format(metric.value);
}

/**
 * Valorisation du portefeuille : PER, rendement et bêta pondérés par la valeur de marché, avec la
 * part du portefeuille couverte. Le détail par actif est replié par défaut.
 */
export function PortfolioValuationPanel({ valuation }: { valuation: PortfolioValuation }) {
  const { t } = useTranslation("common");
  const coverage = (metric: WeightedPortfolioMetric) => (metric.value === undefined ? undefined : t("analysis.valuation.coverage", { value: formatPercent(metric.coverage) }));

  return (
    <div className="space-y-4">
      <MetricGrid
        columnsClassName="grid-cols-1 sm:grid-cols-3"
        items={[
          { key: "pe", label: t("analysis.valuation.trailingPE"), value: metricValue(valuation.trailingPE, (value) => formatRatio(value, 1)), hint: t("analysis.valuation.trailingPEHint"), sub: coverage(valuation.trailingPE), icon: <Scale size={16} />, iconTone: "sky" },
          { key: "yield", label: t("analysis.valuation.dividendYield"), value: metricValue(valuation.dividendYield, (value) => formatFractionPercent(value, { digits: 2 })), hint: t("analysis.valuation.dividendYieldHint"), sub: coverage(valuation.dividendYield), icon: <Percent size={16} />, iconTone: "green" },
          { key: "beta", label: t("analysis.valuation.beta"), value: metricValue(valuation.beta, (value) => formatRatio(value)), hint: t("analysis.valuation.betaHint"), sub: coverage(valuation.beta), icon: <Activity size={16} />, iconTone: "amber" }
        ]}
        minVisible={1}
      />
      <p className="text-xs text-slate-400">{t("analysis.valuation.exclusionNote")}</p>
      <DetailsToggle label={t("analysis.valuation.byAsset")} storageKey="analysis.valuation.byAsset">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-semibold">{t("analysis.valuation.asset")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("analysis.valuation.weight")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("analysis.valuation.trailingPE")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("analysis.valuation.dividendYield")}</th>
                <th className="py-2 text-right font-semibold">{t("analysis.valuation.beta")}</th>
              </tr>
            </thead>
            <tbody>
              {valuation.items.map((item) => (
                <tr className="border-t border-white/[0.05]" key={item.symbol}>
                  <td className="py-2 pr-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <AssetIcon className="h-7 w-7" symbol={item.symbol} />
                      <span className="truncate text-slate-100">{item.name}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{formatPercent(item.weight)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-200">
                    {item.trailingPE === undefined ? MISSING_VALUE : isMeaningfulMultiple(item.trailingPE) ? formatRatio(item.trailingPE, 1) : t("analysis.valuation.notMeaningful")}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-200">{formatFractionPercent(item.dividendYield, { digits: 2 })}</td>
                  <td className="py-2 text-right tabular-nums text-slate-200">{formatRatio(item.beta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailsToggle>
    </div>
  );
}
