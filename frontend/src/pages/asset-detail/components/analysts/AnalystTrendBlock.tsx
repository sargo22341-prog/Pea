import type { AnalystGradeChange, AssetAnalystTrend } from "@pea/shared";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MOTION, staggerDelay } from "../../../../components/common/motion";
import { formatMaybeDate } from "../../../../lib/format";
import { RecommendationBar } from "./RecommendationBar";

const DIRECTION_STYLE = {
  "more-positive": { icon: ArrowUpRight, className: "text-mint" },
  stable: { icon: ArrowRight, className: "text-slate-300" },
  "more-negative": { icon: ArrowDownRight, className: "text-coral" }
} as const;

function GradeChangeIcon({ change }: { change: AnalystGradeChange }) {
  if (change.action === "up") return <ArrowUpRight aria-hidden className="text-mint" size={16} />;
  if (change.action === "down") return <ArrowDownRight aria-hidden className="text-coral" size={16} />;
  return <Minus aria-hidden className="text-slate-500" size={16} />;
}

/** Tendance des recommandations : mois courant et direction, puis historique replié. */
export function AnalystTrendBlock({ trend }: { trend: AssetAnalystTrend }) {
  const { t } = useTranslation("asset");
  const current = trend.periods.at(-1);
  const direction = trend.direction ? DIRECTION_STYLE[trend.direction] : undefined;
  const DirectionIcon = direction?.icon;

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("analystTrend.title")}</h2>
      {current ? <RecommendationBar period={current} /> : null}
      {direction && DirectionIcon && trend.direction ? (
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${direction.className}`}>
          <DirectionIcon aria-hidden className={MOTION.pop} size={16} />
          {t(`analystTrend.direction.${trend.direction}`)}
        </p>
      ) : null}
      {trend.periods.length > 1 || trend.history.length ? (
        <DetailsToggle label={t("analystTrend.history")} storageKey="analyst-trend">
          <div className="space-y-2">
            {trend.periods.map((period) => (
              <div className="grid grid-cols-[5rem_1fr] items-center gap-3 text-xs" key={period.period}>
                <span className="text-slate-400">{t("analystTrend.monthsAgo", { count: Math.abs(Number.parseInt(period.period, 10)) })}</span>
                <RecommendationBar compact period={period} />
              </div>
            ))}
          </div>
          {trend.history.length ? (
            <ol className="mt-4 space-y-2 border-l border-line pl-3">
              {trend.history.map((change, index) => (
                <li className={`flex items-start gap-2 text-sm ${MOTION.rise}`} key={`${change.date}-${change.firm}`} style={{ animationDelay: staggerDelay(index) }}>
                  <GradeChangeIcon change={change} />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-100">{change.firm}</span>
                    <span className="text-slate-400"> · {formatMaybeDate(change.date)}</span>
                    <span className="block text-xs text-slate-300">
                      {change.fromGrade && change.fromGrade !== change.toGrade ? `${change.fromGrade} → ` : ""}{change.toGrade ?? t(`analystTrend.actions.${change.action}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </DetailsToggle>
      ) : null}
    </section>
  );
}
