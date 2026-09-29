import type { AnalystGradeAction, AnalystGradeChange, AnalystRecommendationPeriod, AnalystTrendDirection, AssetAnalystTrend } from "@pea/shared";
import { rawArray, rawRecord, type YahooSummaryRaw } from "../../yahoo.raw.js";
import { rawDate, rawNumber, rawString } from "../../utils/raw-values.js";

/** Nombre de changements de recommandation conservés dans la chronologie. */
export const ANALYST_HISTORY_LIMIT = 10;
/** Variation de note moyenne (échelle 1 à 5) sous laquelle le consensus est jugé stable. */
const ANALYST_TREND_STABLE_THRESHOLD = 0.1;
const GRADE_ACTIONS: readonly AnalystGradeAction[] = ["up", "down", "init", "main", "reit"];
/** Poids de chaque avis sur l'échelle Yahoo : 1 = achat fort, 5 = vente forte. */
const SCORE_WEIGHTS = { strongBuy: 1, buy: 2, hold: 3, sell: 4, strongSell: 5 } as const;

function periodOffset(period: string) {
  const months = Number(/^(-?\d+)m$/.exec(period)?.[1]);
  return Number.isFinite(months) ? months : undefined;
}

function periodTotal(period: AnalystRecommendationPeriod) {
  return period.strongBuy + period.buy + period.hold + period.sell + period.strongSell;
}

/** Note moyenne d'un mois sur l'échelle 1 (achat fort) à 5 (vente forte). */
function recommendationScore(period: AnalystRecommendationPeriod) {
  const total = periodTotal(period);
  if (!total) return undefined;
  const weighted = (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).reduce((sum, key) => sum + period[key] * SCORE_WEIGHTS[key], 0);
  return weighted / total;
}

function trendDirection(periods: AnalystRecommendationPeriod[]): AnalystTrendDirection | undefined {
  const oldest = periods[0];
  const latest = periods.at(-1);
  if (!oldest || !latest || oldest === latest) return undefined;
  const before = recommendationScore(oldest);
  const now = recommendationScore(latest);
  if (before === undefined || now === undefined) return undefined;
  if (now < before - ANALYST_TREND_STABLE_THRESHOLD) return "more-positive";
  if (now > before + ANALYST_TREND_STABLE_THRESHOLD) return "more-negative";
  return "stable";
}

function periodsFromSummary(summary: YahooSummaryRaw): AnalystRecommendationPeriod[] {
  return rawArray<unknown>(summary.recommendationTrend?.trend)
    .flatMap((entry): (AnalystRecommendationPeriod & { offset: number })[] => {
      const row = rawRecord(entry);
      const period = rawString(row["period"]);
      const offset = period === undefined ? undefined : periodOffset(period);
      if (period === undefined || offset === undefined) return [];
      const counts = {
        strongBuy: rawNumber(row["strongBuy"]) ?? 0,
        buy: rawNumber(row["buy"]) ?? 0,
        hold: rawNumber(row["hold"]) ?? 0,
        sell: rawNumber(row["sell"]) ?? 0,
        strongSell: rawNumber(row["strongSell"]) ?? 0
      };
      return [{ period, offset, ...counts }];
    })
    .filter((row) => periodTotal(row) > 0)
    .sort((a, b) => a.offset - b.offset)
    .map(({ offset: _offset, ...row }) => row);
}

function historyFromSummary(summary: YahooSummaryRaw): AnalystGradeChange[] {
  return rawArray<unknown>(summary.upgradeDowngradeHistory?.history)
    .flatMap((entry): AnalystGradeChange[] => {
      const row = rawRecord(entry);
      const date = rawDate(row["epochGradeDate"]);
      const firm = rawString(row["firm"]);
      if (!date || !firm) return [];
      const action = GRADE_ACTIONS.find((item) => item === rawString(row["action"])) ?? "other";
      return [{ date, firm, action, fromGrade: rawString(row["fromGrade"]), toGrade: rawString(row["toGrade"]) }];
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, ANALYST_HISTORY_LIMIT);
}

/** Tendance des recommandations et derniers changements des cabinets ; absent sans aucune donnée. */
export function analystTrendFromSummary(summary: YahooSummaryRaw): AssetAnalystTrend | undefined {
  const periods = periodsFromSummary(summary);
  const history = historyFromSummary(summary);
  if (!periods.length && !history.length) return undefined;
  return { periods, direction: trendDirection(periods), history };
}
