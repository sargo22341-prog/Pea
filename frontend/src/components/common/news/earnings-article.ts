import type { NewsArticle } from "@pea/shared";

/**
 * Indique si l'article accompagne une publication de résultats : pour un actif précis
 * (regroupement par actif) ou pour l'un quelconque des actifs liés.
 */
export function isEarningsArticle(article: NewsArticle, symbol?: string) {
  const symbols = article.earningsSymbols ?? [];
  if (symbol === undefined) return symbols.length > 0;
  return symbols.some((candidate) => candidate.toUpperCase() === symbol.toUpperCase());
}
