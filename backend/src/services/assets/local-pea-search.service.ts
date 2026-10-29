import type { EnrichedSearchResult } from "@pea/shared";
import { peaCatalog } from "./pea-catalog/catalog.js";
import { watchlistRepository } from "../../repositories/assets/watchlist.repository.js";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { requireUserId } from "../auth/user-context.js";
import { primitiveText } from "../../utils/text.js";

const maxResults = 20;

function normalize(value: unknown) {
  return primitiveText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const assets = peaCatalog.map((item) => ({ ...item,
  searchText: normalize([item.symbol, item.ticker, item.isin, item.name].join(" "))
}));

export class LocalPeaSearchService {
  search(query: string, userId?: number | string): EnrichedSearchResult[] {
    const normalizedQuery = normalize(query);
    if (normalizedQuery.length < 2) return [];

    const resolvedUserId = requireUserId(userId);
    const watchlistSymbols = new Set(watchlistRepository.symbols(resolvedUserId));
    const portfolioSymbols = new Set(portfolioRepository.heldPositionSymbols(resolvedUserId));

    return assets
      .filter((item) => item.searchText.includes(normalizedQuery))
      .slice(0, maxResults)
      .map((item) => ({
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
        quoteType: item.quoteType,
        currency: item.currency,
        isInWatchlist: watchlistSymbols.has(item.symbol),
        isInPortfolio: portfolioSymbols.has(item.symbol)
      }));
  }
}

export const localPeaSearchService = new LocalPeaSearchService();
