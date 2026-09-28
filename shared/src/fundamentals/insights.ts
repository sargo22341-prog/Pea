export type InsightDirection = "bullish" | "bearish" | "neutral";

export interface InsightOutlook {
  direction: InsightDirection;
  /** Force du signal publiée par le fournisseur (0 à 5). */
  score?: number | undefined;
}

export type InsightValuationLabel = "undervalued" | "fair" | "overvalued";

/**
 * Signaux techniques et valorisation relative (Yahoo `insights`, fournisseur Trading Central).
 * Information uniquement : les contenus promotionnels de la réponse ne sont jamais exposés.
 */
export interface AssetInsights {
  provider?: string | undefined;
  shortTerm?: InsightOutlook | undefined;
  midTerm?: InsightOutlook | undefined;
  longTerm?: InsightOutlook | undefined;
  support?: number | undefined;
  resistance?: number | undefined;
  stopLoss?: number | undefined;
  valuation?: {
    label: InsightValuationLabel;
    /** Écart à la juste valeur estimée en fraction (-0,08 = 8 % au-dessus). */
    discount?: number | undefined;
  } | undefined;
}

/** Actif proposé comme alternative sur la fiche (Yahoo `recommendationsBySymbol`). */
export interface SimilarAsset {
  symbol: string;
  name: string;
  price?: number | undefined;
  currency?: string | undefined;
  changePercent?: number | undefined;
  peaEligible: boolean;
}
