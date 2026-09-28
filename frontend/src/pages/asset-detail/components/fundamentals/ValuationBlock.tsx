import type { AssetValuation } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import { METRIC_GRID_MIN_VISIBLE, visibleMetrics } from "../../../../components/common/metrics/metric-items";
import { MOTION } from "../../../../components/common/motion";
import { formatFractionPercent } from "../../../../lib/format-metrics";
import { primaryValuationItems, secondaryValuationItems } from "./valuation-items";

/** Performance sur 52 semaines de l'actif face à son indice de référence, en barres signées. */
function FiftyTwoWeekComparison({ asset, index }: { asset?: number | undefined; index?: number | undefined }) {
  const { t } = useTranslation("asset");
  const rows = [
    { key: "asset", label: t("valuation.fiftyTwoWeekAsset"), value: asset },
    { key: "index", label: t("valuation.fiftyTwoWeekIndex"), value: index }
  ].filter((row): row is { key: string; label: string; value: number } => row.value !== undefined && Number.isFinite(row.value));
  if (!rows.length) return null;
  const scale = Math.max(...rows.map((row) => Math.abs(row.value)), Number.EPSILON);

  return (
    <div className="mt-3 rounded-[14px] border border-white/[0.05] bg-slate-950/20 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t("valuation.fiftyTwoWeekTitle")}</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-xs" key={row.key}>
            <span className="truncate text-slate-300">{row.label}</span>
            <div className="h-2 rounded-full bg-slate-950/80">
              <div className={`h-full rounded-full ${MOTION.barGrow} ${row.value >= 0 ? "bg-mint" : "bg-coral"}`} style={{ width: `${(Math.abs(row.value) / scale) * 100}%` }} />
            </div>
            <span className={`text-right font-semibold ${row.value >= 0 ? "text-mint" : "text-coral"}`}>{formatFractionPercent(row.value, { signed: true })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bloc « Valorisation » : le titre est-il cher ? Masqué sous deux indicateurs disponibles. */
export function ValuationBlock({ valuation }: { valuation: AssetValuation }) {
  const { t } = useTranslation("asset");
  const primary = primaryValuationItems(valuation, t);
  const secondary = secondaryValuationItems(valuation, t);
  const hasComparison = valuation.fiftyTwoWeekChange !== undefined || valuation.indexFiftyTwoWeekChange !== undefined;
  if (visibleMetrics([...primary, ...secondary]).length < METRIC_GRID_MIN_VISIBLE) return null;

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("valuation.title")}</h2>
      <MetricGrid items={primary} minVisible={1} />
      {visibleMetrics(secondary).length > 0 || hasComparison ? (
        <DetailsToggle label={t("valuation.moreRatios")} storageKey="valuation">
          <MetricGrid columnsClassName="grid-cols-2 lg:grid-cols-3" items={secondary} minVisible={1} />
          {hasComparison ? <FiftyTwoWeekComparison asset={valuation.fiftyTwoWeekChange} index={valuation.indexFiftyTwoWeekChange} /> : null}
        </DetailsToggle>
      ) : null}
    </section>
  );
}
