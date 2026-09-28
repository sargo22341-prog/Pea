import type { AssetFinancialHealthMetrics, AssetFinancialHealthVerdict, HealthCategory, HealthRating, RatedHealthMetric } from "./health.js";
import { HEALTH_THRESHOLDS, HEALTH_VERDICT_MIN_METRICS } from "./health-thresholds.js";

const RATING_SCORE: Record<HealthRating, number> = { good: 2, fair: 1, weak: 0 };
/** Moyenne de scores (0 à 2) à partir de laquelle un groupe d'indicateurs est jugé bon ou correct. */
const GOOD_AVERAGE_SCORE = 1.5;
const FAIR_AVERAGE_SCORE = 0.75;

export const RATED_HEALTH_METRICS: readonly RatedHealthMetric[] = [
  "returnOnEquity",
  "profitMargin",
  "operatingMargin",
  "debtToEquity",
  "currentRatio",
  "revenueGrowth",
  "earningsGrowth"
];

/** Indique si un indicateur doit être affiché et noté pour ce type d'entreprise. */
export function healthMetricApplies(metric: RatedHealthMetric, isFinancialSector: boolean) {
  return !(isFinancialSector && HEALTH_THRESHOLDS[metric].skipForFinancialSector);
}

/** Note un indicateur selon les seuils partagés ; `undefined` si la valeur est absente ou non applicable. */
export function rateHealthMetric(metric: RatedHealthMetric, value: number | undefined, isFinancialSector = false): HealthRating | undefined {
  if (value === undefined || !Number.isFinite(value) || !healthMetricApplies(metric, isFinancialSector)) return undefined;
  const threshold = HEALTH_THRESHOLDS[metric];
  if (threshold.direction === "higher-is-better") {
    if (value >= threshold.good) return "good";
    return value < threshold.weak ? "weak" : "fair";
  }
  if (value <= threshold.good) return "good";
  return value > threshold.weak ? "weak" : "fair";
}

function averageRating(ratings: HealthRating[]): HealthRating | undefined {
  if (!ratings.length) return undefined;
  const average = ratings.reduce((sum, rating) => sum + RATING_SCORE[rating], 0) / ratings.length;
  if (average >= GOOD_AVERAGE_SCORE) return "good";
  return average >= FAIR_AVERAGE_SCORE ? "fair" : "weak";
}

/**
 * Verdict de santé financière : chaque famille (rentabilité, endettement, croissance) est la
 * moyenne de ses indicateurs notés, et le verdict global la moyenne de tous les indicateurs.
 * Retourne `undefined` sous `HEALTH_VERDICT_MIN_METRICS` indicateurs notés.
 */
export function rateFinancialHealth(metrics: AssetFinancialHealthMetrics, isFinancialSector: boolean): AssetFinancialHealthVerdict | undefined {
  const byCategory = new Map<HealthCategory, HealthRating[]>();
  const all: HealthRating[] = [];
  for (const metric of RATED_HEALTH_METRICS) {
    const rating = rateHealthMetric(metric, metrics[metric], isFinancialSector);
    if (!rating) continue;
    const category = HEALTH_THRESHOLDS[metric].category;
    byCategory.set(category, [...(byCategory.get(category) ?? []), rating]);
    all.push(rating);
  }
  if (all.length < HEALTH_VERDICT_MIN_METRICS) return undefined;
  const overall = averageRating(all);
  if (!overall) return undefined;
  const categories: AssetFinancialHealthVerdict["categories"] = {};
  for (const [category, ratings] of byCategory) {
    const rating = averageRating(ratings);
    if (rating) categories[category] = rating;
  }
  return { overall, categories };
}
