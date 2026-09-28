import type { DividendSustainabilityItem } from "@pea/shared";
import { rateFreeCashFlowCoverage, ratePayoutRatio } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { AssetIcon } from "../../../../components/common/AssetIcon";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { MOTION, staggerDelay } from "../../../../components/common/motion";
import { formatFractionPercent, formatRatio } from "../../../../lib/format-metrics";
import { ratingFillClass, ratingToneClass } from "../../../../utils/assetTone";
import { RATING_ORDER, sustainabilityRating } from "./sustainability-rating";

/**
 * Dividendes durables : classement des lignes du dividende le mieux couvert au plus fragile, avec
 * les seuils partagés (mêmes couleurs que la page Dividendes et la fiche actif).
 */
export function DividendSustainabilityPanel({ items }: { items: DividendSustainabilityItem[] }) {
  const { t } = useTranslation("common");
  const counts = RATING_ORDER.map((rating) => ({ rating, count: items.filter((item) => sustainabilityRating(item) === rating).length })).filter((entry) => entry.count > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[...counts].reverse().map(({ rating, count }) => (
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${MOTION.pop} ${ratingToneClass(rating)}`} key={rating}>
            {t(`analysis.dividends.count.${rating}`, { count })}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-end gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">{t("analysis.dividends.payoutRatio")}<InfoHint label={t("analysis.dividends.payoutRatio")}>{t("analysis.dividends.payoutRatioHint")}</InfoHint></span>
        <span className="inline-flex items-center gap-1">{t("analysis.dividends.fcfCoverage")}<InfoHint label={t("analysis.dividends.fcfCoverage")}>{t("analysis.dividends.fcfCoverageHint")}</InfoHint></span>
      </div>
      <ol className="space-y-3">
        {items.map((item, index) => {
          const payoutRating = ratePayoutRatio(item.payoutRatio);
          const coverageRating = rateFreeCashFlowCoverage(item.fcfCoverage);
          const width = Math.max(0, Math.min(1, item.payoutRatio ?? 0)) * 100;
          return (
            <li className={MOTION.rise} key={item.symbol} style={{ animationDelay: staggerDelay(index) }}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <AssetIcon className="h-7 w-7" symbol={item.symbol} />
                  <span className="truncate font-medium text-slate-100">{item.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span className="text-slate-200">{formatFractionPercent(item.payoutRatio, { digits: 0 })}</span>
                  {coverageRating ? (
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ratingToneClass(coverageRating)}`}>
                      {t("analysis.dividends.coverageValue", { value: formatRatio(item.fcfCoverage, 1) })}
                    </span>
                  ) : null}
                </span>
              </div>
              {payoutRating ? (
                <div className="h-1.5 rounded-full bg-slate-950/80">
                  <div className={`h-full rounded-full ${MOTION.barGrow} ${ratingFillClass(payoutRating)}`} style={{ width: `${width}%`, animationDelay: staggerDelay(index) }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
