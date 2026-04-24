import type { DividendEvent, HistoryPoint, Quote, RangeKey, SearchResult } from "@pea/shared";

export interface MarketDataResult<T> {
  data: T;
  stale: boolean;
}

export interface MarketDataProvider {
  search(query: string): Promise<MarketDataResult<SearchResult[]>>;
  quote(symbol: string): Promise<MarketDataResult<Quote>>;
  history(symbol: string, range: RangeKey): Promise<MarketDataResult<HistoryPoint[]>>;
  dividends(symbol: string): Promise<MarketDataResult<DividendEvent[]>>;
}
