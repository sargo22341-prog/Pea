/**
 * Rôle du fichier : définir le contrat minimal des fournisseurs de données de marché
 * utilisés par les services métier du backend.
 */

import type { DividendEvent, HistoryPoint, Quote, RangeKey, SearchResult } from "@pea/shared";

export interface MarketDataResult<T> {
  data: T;
  stale: boolean;
}

export interface MarketDataProvider {
  search(query: string): Promise<MarketDataResult<SearchResult[]>>;
  quote(symbol: string): Promise<MarketDataResult<Quote>>;
  quoteBatch(symbols: string[]): Promise<MarketDataResult<Quote[]>>;
  history(symbol: string, range: RangeKey): Promise<MarketDataResult<HistoryPoint[]>>;
  dividends(symbol: string): Promise<MarketDataResult<DividendEvent[]>>;
}
