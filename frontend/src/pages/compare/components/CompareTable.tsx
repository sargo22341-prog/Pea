import type { CompareAssetDto } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { Collapsible } from "../../../components/common/feedback/Collapsible";
import { MOTION } from "../../../components/common/motion";
import { bestSymbols, COMPARE_FAMILIES, familyMetrics, formatMetric, type CompareFamily } from "../compare-metrics";

function FamilyTable({ family, assets }: { family: CompareFamily; assets: readonly CompareAssetDto[] }) {
  const { t } = useTranslation(["compare", "asset"]);
  const metrics = familyMetrics(family, assets);
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="py-2 pr-3 font-medium">{t(`compare:families.${family}`)}</th>
            {assets.map((asset) => (
              <th className={`py-2 pr-3 font-semibold text-slate-200 ${MOTION.rise}`} key={asset.symbol} scope="col">{asset.symbol}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const best = bestSymbols(metric, assets);
            return (
              <tr className="border-t border-line/60" key={metric.key}>
                <th className="py-2 pr-3 text-left font-normal text-slate-400" scope="row">{t(metric.labelKey)}</th>
                {assets.map((asset) => (
                  <td className={`py-2 pr-3 tabular-nums ${best.has(asset.symbol) ? "font-semibold text-mint" : "text-slate-200"}`} key={asset.symbol}>
                    {formatMetric(metric, asset)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Tableau par familles : seule la valorisation est ouverte ; une famille sans donnée est masquée. */
export function CompareTable({ assets }: { assets: readonly CompareAssetDto[] }) {
  const { t } = useTranslation("compare");
  const families = COMPARE_FAMILIES.filter((family) => familyMetrics(family, assets).length > 0);
  if (!families.length) return <div className="card p-4 text-sm text-slate-400">{t("table.empty")}</div>;

  return (
    <div className="space-y-3">
      {families.map((family, index) => (
        <Collapsible defaultOpen={family === "valuation" || (index === 0 && !families.includes("valuation"))} key={family} title={t(`families.${family}`)}>
          <FamilyTable assets={assets} family={family} />
        </Collapsible>
      ))}
      <p className="text-xs text-slate-500">{t("table.disclaimer")}</p>
    </div>
  );
}
