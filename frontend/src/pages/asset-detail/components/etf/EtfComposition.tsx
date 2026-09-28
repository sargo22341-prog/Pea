import type { AssetFundDetails } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectorAllocationChart } from "../../../../components/charts/allocation/SectorAllocationChart";
import { MOTION, staggerDelay } from "../../../../components/common/motion";
import { formatFractionPercent } from "../../../../lib/format-metrics";
import { allocationChartItems, sectorChartItems } from "./etf-allocation";

/** Onglet « Composition » d'un ETF : lignes principales, classes d'actifs et secteurs. */
export function EtfComposition({ data }: { data: AssetFundDetails }) {
  const { t } = useTranslation("asset");
  const holdings = data.holdings ?? [];
  const maxWeight = Math.max(...holdings.map((holding) => holding.weight), 0);
  const allocation = allocationChartItems(data.allocation, (key) => t(`etf.allocation.${key}`));
  const sectors = sectorChartItems(data.sectorWeightings, (key) => t(`etf.sectors.${key}`, { defaultValue: key }));

  return (
    <div className="space-y-4">
      {holdings.length > 0 ? (
        <section className="card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("etf.holdingsTitle", { count: holdings.length })}</h2>
          <ol className="space-y-2.5">
            {holdings.map((holding, index) => (
              <li className={MOTION.rise} key={`${holding.symbol ?? holding.name}-${String(index)}`} style={{ animationDelay: staggerDelay(index) }}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  {holding.symbol ? (
                    <Link className="truncate font-medium text-slate-100 hover:text-sky" to={`/assets/${encodeURIComponent(holding.symbol)}`}>{holding.name}</Link>
                  ) : (
                    <span className="truncate font-medium text-slate-100">{holding.name}</span>
                  )}
                  <span className="shrink-0 font-semibold text-slate-200">{formatFractionPercent(holding.weight, { digits: 2 })}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-950/80">
                  <div
                    className={`h-full rounded-full bg-sky ${MOTION.barGrow}`}
                    style={{ width: `${maxWeight > 0 ? (holding.weight / maxWeight) * 100 : 0}%`, animationDelay: staggerDelay(index) }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {allocation.length > 0 ? (
          <section className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("etf.allocationTitle")}</h2>
            <SectorAllocationChart data={allocation} />
          </section>
        ) : null}
        {sectors.length > 0 ? (
          <section className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("etf.sectorsTitle")}</h2>
            <SectorAllocationChart data={sectors} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
