import type { MarketListId, MarketListResponse, TopMover } from "@pea/shared";
import { fetchMarketList } from "../yahoo/screeners/top-movers.job.js";
import { isProbablyPeaEligible } from "./peaEligibility.js";

function withPeaEligibility(item: TopMover): TopMover {
  return {
    ...item,
    peaEligible: isProbablyPeaEligible({ symbol: item.symbol, name: item.shortName ?? item.symbol, exchange: item.exchange, currency: item.currency ?? "", quoteType: item.quoteType ?? "" })
  };
}

/**
 * Liste Yahoo Finance annotée de l'éligibilité PEA ; avec `peaOnly`, seuls les titres probablement
 * éligibles sont conservés (les listes américaines deviennent alors vides).
 */
export async function marketList(id: MarketListId, peaOnly: boolean): Promise<MarketListResponse> {
  const list = await fetchMarketList(id);
  const items = list.items.map(withPeaEligibility);
  return { ...list, items: peaOnly ? items.filter((item) => item.peaEligible) : items, peaOnly };
}
