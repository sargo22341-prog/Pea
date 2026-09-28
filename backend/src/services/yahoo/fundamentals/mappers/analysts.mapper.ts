import type { AssetAnalystConsensus } from "@pea/shared";
import type { YahooSummaryRaw } from "../../yahoo.raw.js";
import { rawNumber, rawString } from "../../utils/raw-values.js";

export function analystConsensusFromSummary(summary: YahooSummaryRaw): AssetAnalystConsensus | undefined {
  const financialData = summary.financialData;
  if (!financialData) return undefined;
  const numberOfAnalystOpinions = rawNumber(financialData.numberOfAnalystOpinions);
  if (!numberOfAnalystOpinions) return undefined;
  return {
    currentPrice: rawNumber(financialData.currentPrice),
    targetHighPrice: rawNumber(financialData.targetHighPrice),
    targetLowPrice: rawNumber(financialData.targetLowPrice),
    targetMeanPrice: rawNumber(financialData.targetMeanPrice),
    targetMedianPrice: rawNumber(financialData.targetMedianPrice),
    recommendationMean: rawNumber(financialData.recommendationMean),
    recommendationKey: rawString(financialData.recommendationKey),
    numberOfAnalystOpinions
  };
}
