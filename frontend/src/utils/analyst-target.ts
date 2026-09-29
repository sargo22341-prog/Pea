import type { AssetAnalystConsensus } from "@pea/shared";

/**
 * Objectif de cours retenu (médian, sinon moyen) et potentiel par rapport au cours actuel,
 * en fraction (0,12 = +12 %). Absent sans objectif ou sans cours.
 */
export function analystTarget(data: AssetAnalystConsensus | undefined) {
  const targetPrice = data?.targetMedianPrice ?? data?.targetMeanPrice;
  const currentPrice = data?.currentPrice;
  if (!targetPrice || !currentPrice) return undefined;
  return { targetPrice, currentPrice, upside: targetPrice - currentPrice, potential: (targetPrice - currentPrice) / currentPrice };
}
