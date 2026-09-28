import {
  FCF_COVERAGE_GOOD,
  FCF_COVERAGE_WEAK,
  PAYOUT_RATIO_GOOD_MAX,
  PAYOUT_RATIO_WEAK_ABOVE,
  rateFreeCashFlowCoverage,
  ratePayoutRatio,
  type DividendGrowthSummary,
  type FreeCashFlowCoverage
} from "@pea/shared";
import type { TFunction } from "i18next";
import type { MetricItem } from "../../../../components/common/metrics/metric-items";
import { formatFractionPercent, formatRatio } from "../../../../lib/format-metrics";
import { ratingInfoTone, toneFromNumber } from "../../../../utils/assetTone";

/**
 * Indicateurs du bloc « Croissance et soutenabilité » : un indicateur absent n'est pas affiché
 * (valeur `undefined`), les couleurs suivent les seuils partagés avec le backend.
 */
export function sustainabilityItems(
  input: { payoutRatio?: number | undefined; coverage?: FreeCashFlowCoverage | undefined; growth: DividendGrowthSummary },
  t: TFunction<"asset">
): MetricItem[] {
  const { payoutRatio, coverage, growth } = input;
  return [
    {
      key: "payout",
      label: t("dividendSustainability.payout"),
      value: ratePayoutRatio(payoutRatio) && payoutRatio !== undefined ? formatFractionPercent(payoutRatio, { digits: 0 }) : undefined,
      tone: ratingInfoTone(ratePayoutRatio(payoutRatio)),
      hint: t("dividendSustainability.payoutHint", {
        good: formatFractionPercent(PAYOUT_RATIO_GOOD_MAX, { digits: 0 }),
        weak: formatFractionPercent(PAYOUT_RATIO_WEAK_ABOVE, { digits: 0 })
      })
    },
    {
      key: "coverage",
      label: t("dividendSustainability.coverage"),
      value: coverage ? t("dividendSustainability.coverageValue", { value: formatRatio(coverage.coverage, 1) }) : undefined,
      tone: ratingInfoTone(rateFreeCashFlowCoverage(coverage?.coverage)),
      hint: t("dividendSustainability.coverageHint", { good: formatRatio(FCF_COVERAGE_GOOD, 1), weak: formatRatio(FCF_COVERAGE_WEAK, 1) })
    },
    {
      key: "growth",
      label: t("dividendSustainability.growth"),
      value: growth.growthRate === undefined ? undefined : t("dividendSustainability.perYear", { value: formatFractionPercent(growth.growthRate, { signed: true }) }),
      tone: growth.growthRate === undefined ? undefined : toneFromNumber(growth.growthRate),
      hint: t("dividendSustainability.growthHint")
    },
    {
      key: "streak",
      label: t("dividendSustainability.streak"),
      value: growth.history.length > 1 ? t("dividendSustainability.streakValue", { count: growth.increaseStreak }) : undefined,
      hint: t("dividendSustainability.streakHint")
    }
  ];
}
