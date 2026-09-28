import type { AssetInsights, InsightDirection, InsightOutlook, InsightValuationLabel } from "@pea/shared";
import { rawRecord } from "../yahoo.raw.js";
import { rawNumber, rawString } from "../utils/raw-values.js";

const DIRECTIONS: Record<string, InsightDirection> = { bullish: "bullish", bearish: "bearish", neutral: "neutral" };
const VALUATIONS: Record<string, InsightValuationLabel> = { undervalued: "undervalued", overvalued: "overvalued", "near fair value": "fair" };
const PERCENT_PATTERN = /^\s*([+-]?\d+(?:[.,]\d+)?)\s*%\s*$/;

function outlook(value: unknown): InsightOutlook | undefined {
  const row = rawRecord(value);
  const direction = DIRECTIONS[rawString(row["direction"])?.toLowerCase() ?? ""];
  return direction ? { direction, score: rawNumber(row["score"]) } : undefined;
}

/** « -8% » publié par Trading Central, ramené en fraction (-0,08). */
function discountFraction(value: unknown) {
  const match = PERCENT_PATTERN.exec(rawString(value) ?? "");
  return match?.[1] ? Number(match[1].replace(",", ".")) / 100 : undefined;
}

/**
 * Signaux techniques d'un actif. Seules les données d'analyse sont lues : `upsell`,
 * `recommendation` et autres contenus commerciaux de la réponse sont ignorés.
 */
export function insightsFromResponse(raw: unknown): AssetInsights | undefined {
  const info = rawRecord(rawRecord(raw)["instrumentInfo"]);
  if (!Object.keys(info).length) return undefined;
  const events = rawRecord(info["technicalEvents"]);
  const technicals = rawRecord(info["keyTechnicals"]);
  const valuation = rawRecord(info["valuation"]);
  const valuationLabel = VALUATIONS[rawString(valuation["description"])?.toLowerCase() ?? ""];
  const insights: AssetInsights = {
    provider: rawString(events["provider"]) ?? rawString(technicals["provider"]),
    shortTerm: outlook(events["shortTermOutlook"]),
    midTerm: outlook(events["intermediateTermOutlook"]),
    longTerm: outlook(events["longTermOutlook"]),
    support: rawNumber(technicals["support"]),
    resistance: rawNumber(technicals["resistance"]),
    stopLoss: rawNumber(technicals["stopLoss"]),
    valuation: valuationLabel ? { label: valuationLabel, discount: discountFraction(valuation["discount"]) } : undefined
  };
  const hasSignal = [insights.shortTerm, insights.midTerm, insights.longTerm, insights.support, insights.resistance, insights.valuation].some((value) => value !== undefined);
  return hasSignal ? insights : undefined;
}
