/**
 * Modules `quoteSummary` de l'appel fundamentals unique mis en cache. Tout nouveau bloc s'y ajoute
 * plutôt que de créer un appel ; le suivi d'usage Yahoo lit la même liste.
 */
const BASE_FUNDAMENTALS_MODULES = [
  "assetProfile",
  "calendarEvents",
  "defaultKeyStatistics",
  "financialData",
  "fundProfile",
  "fundPerformance",
  "topHoldings",
  "summaryDetail",
  "price",
  "quoteType"
];

/** Tendance des analystes et résultats trimestriels, soumis à l'interrupteur `extended_fundamentals`. */
export const EXTENDED_FUNDAMENTALS_MODULES = ["recommendationTrend", "upgradeDowngradeHistory", "earningsHistory", "earnings"];

export function fundamentalsModules(extended: boolean) {
  return extended ? [...BASE_FUNDAMENTALS_MODULES, ...EXTENDED_FUNDAMENTALS_MODULES] : [...BASE_FUNDAMENTALS_MODULES];
}
