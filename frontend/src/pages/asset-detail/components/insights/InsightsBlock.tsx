import type { AssetInsights, InsightDirection, InsightOutlook } from "@pea/shared";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MetricGrid } from "../../../../components/common/metrics/MetricGrid";
import { MOTION } from "../../../../components/common/motion";
import { money } from "../../../../lib/format";
import { formatFractionPercent } from "../../../../lib/format-metrics";

const DIRECTION_STYLE: Record<InsightDirection, { icon: typeof ArrowUpRight; className: string }> = {
  bullish: { icon: ArrowUpRight, className: "border-mint/30 bg-mint/10 text-mint" },
  bearish: { icon: ArrowDownRight, className: "border-coral/30 bg-coral/10 text-coral" },
  neutral: { icon: ArrowRight, className: "border-white/10 bg-white/[0.04] text-slate-300" }
};
const HORIZONS = ["shortTerm", "midTerm", "longTerm"] as const;

function OutlookPill({ horizon, outlook }: { horizon: (typeof HORIZONS)[number]; outlook: InsightOutlook }) {
  const { t } = useTranslation("asset");
  const style = DIRECTION_STYLE[outlook.direction];
  const Icon = style.icon;
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${style.className}`}>
      <Icon aria-hidden className={MOTION.pop} size={15} />
      {t(`insights.horizons.${horizon}`)} · {t(`insights.directions.${outlook.direction}`)}
    </li>
  );
}

/** Signaux court, moyen et long terme et valorisation relative ; niveaux techniques repliés. */
export function InsightsBlock({ insights, currency }: { insights: AssetInsights; currency: string }) {
  const { t } = useTranslation("asset");
  const valuation = insights.valuation;
  const provider = insights.provider ?? "Yahoo Finance";

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("insights.title")}</h2>
      <ul className="flex flex-wrap gap-2">
        {HORIZONS.map((horizon) => {
          const outlook = insights[horizon];
          return outlook ? <OutlookPill horizon={horizon} key={horizon} outlook={outlook} /> : null;
        })}
      </ul>
      {valuation ? (
        <p className="mt-3 text-sm text-slate-200">
          {t(`insights.valuation.${valuation.label}`, { discount: formatFractionPercent(Math.abs(valuation.discount ?? 0), { digits: 0 }), provider })}
        </p>
      ) : null}
      {insights.support !== undefined || insights.resistance !== undefined || insights.stopLoss !== undefined ? (
        <DetailsToggle label={t("insights.levels")} storageKey="insights-levels">
          <MetricGrid
            columnsClassName="grid-cols-1 sm:grid-cols-3"
            items={(["support", "resistance", "stopLoss"] as const).map((key) => ({
              key,
              label: t(`insights.${key}`),
              value: insights[key] === undefined ? undefined : money(insights[key], currency),
              hint: t(`insights.${key}Hint`)
            }))}
            minVisible={1}
          />
        </DetailsToggle>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">{t("insights.disclaimer", { provider })}</p>
    </section>
  );
}
