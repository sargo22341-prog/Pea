import type { DividendSustainabilityItem, HealthRating } from "@pea/shared";
import { rateFreeCashFlowCoverage, ratePayoutRatio } from "@pea/shared";

/** Du plus défavorable au plus favorable. */
export const RATING_ORDER: readonly HealthRating[] = ["weak", "fair", "good"];

/** Note d'une ligne : la plus défavorable du taux de distribution et de la couverture FCF. */
export function sustainabilityRating(item: DividendSustainabilityItem): HealthRating | undefined {
  const ratings = [ratePayoutRatio(item.payoutRatio), rateFreeCashFlowCoverage(item.fcfCoverage)].filter((rating): rating is HealthRating => rating !== undefined);
  return RATING_ORDER.find((rating) => ratings.includes(rating));
}
