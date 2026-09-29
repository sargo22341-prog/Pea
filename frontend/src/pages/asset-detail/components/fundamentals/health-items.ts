import {
  HEALTH_THRESHOLDS,
  RATED_HEALTH_METRICS,
  healthMetricApplies,
  rateHealthMetric,
  type AssetFinancialHealth,
  type AssetFinancialHealthMetrics,
  type RatedHealthMetric
} from "@pea/shared";
import type { TFunction } from "i18next";
import type { MetricItem } from "../../../../components/common/metrics/metric-items";
import { formatCompactMoney, formatFractionPercent, formatRatio } from "../../../../lib/format-metrics";
import { ratingInfoTone } from "../../../../utils/assetTone";

type HealthMetricKey = keyof AssetFinancialHealthMetrics;

/** Indicateurs exprimés en fraction et affichés en pourcentage. */
const FRACTION_METRICS = new Set<HealthMetricKey>(["grossMargin", "operatingMargin", "profitMargin", "returnOnEquity", "returnOnAssets", "revenueGrowth", "earningsGrowth"]);
const AMOUNT_METRICS = new Set<HealthMetricKey>(["totalCash", "totalDebt", "freeCashflow", "operatingCashflow"]);
/** Indicateurs affichés sans note, pour information. */
const UNRATED_METRICS: readonly HealthMetricKey[] = ["grossMargin", "returnOnAssets", "quickRatio", "totalCash", "totalDebt", "freeCashflow", "operatingCashflow"];
/** `debtToEquity` est publié en points de pourcentage (53 = 53 %). */
const PERCENT_POINTS_METRICS = new Set<HealthMetricKey>(["debtToEquity"]);

function formatHealthMetric(metric: HealthMetricKey, value: number, currency: string) {
  if (FRACTION_METRICS.has(metric)) return formatFractionPercent(value, { signed: metric.endsWith("Growth") });
  if (AMOUNT_METRICS.has(metric)) return formatCompactMoney(value, currency);
  if (PERCENT_POINTS_METRICS.has(metric)) return `${formatRatio(value, 0)} %`;
  return formatRatio(value);
}

/** Texte du seuil partagé, par exemple « Vert si ≥ 15 %, rouge si < 5 % ». */
function thresholdText(metric: RatedHealthMetric, t: TFunction<"asset">, currency: string) {
  const threshold = HEALTH_THRESHOLDS[metric];
  const good = formatHealthMetric(metric, threshold.good, currency);
  const weak = formatHealthMetric(metric, threshold.weak, currency);
  return threshold.direction === "higher-is-better"
    ? t("health.thresholdHigher", { good, weak })
    : t("health.thresholdLower", { good, weak });
}

/** Indicateurs notés, colorés selon les seuils partagés avec le backend. */
export function ratedHealthItems(health: AssetFinancialHealth, t: TFunction<"asset">): MetricItem[] {
  const currency = health.currency ?? "EUR";
  return RATED_HEALTH_METRICS.filter((metric) => healthMetricApplies(metric, health.isFinancialSector)).map((metric) => {
    const value = health.metrics[metric];
    return {
      key: metric,
      label: t(`health.metrics.${metric}`),
      value: value === undefined ? undefined : formatHealthMetric(metric, value, currency),
      tone: ratingInfoTone(rateHealthMetric(metric, value, health.isFinancialSector)),
      hint: `${t(`health.metrics.${metric}Hint`)} ${thresholdText(metric, t, currency)}`
    };
  });
}

export function otherHealthItems(health: AssetFinancialHealth, t: TFunction<"asset">): MetricItem[] {
  const currency = health.currency ?? "EUR";
  return UNRATED_METRICS.map((metric) => {
    const value = health.metrics[metric];
    return {
      key: metric,
      label: t(`health.metrics.${metric}`),
      value: value === undefined ? undefined : formatHealthMetric(metric, value, currency),
      hint: t(`health.metrics.${metric}Hint`)
    };
  });
}
