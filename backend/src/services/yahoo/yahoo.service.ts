/**
 * Role du fichier : exposer la meme API publique que l'ancien YahooService en
 * deleguant chaque type de travail a un job specialise.
 */

import type { AssetMarketInfo, DividendEvent, HistoryPoint, NewsArticle, NewsFeedPage, NewsLanguage, Quote, RangeKey, SearchResult } from "@pea/shared";
import type { MarketDataProvider, MarketDataResult } from "../market/market-data-provider.js";
import { fetchDividends } from "./dividends/dividends.job.js";
import { fetchFundamentals, fetchMarketInfo } from "./fundamentals/fundamentals.job.js";
import { fetchHistory } from "./history/history.job.js";
import { fetchCompanyNews, fetchGlobalNews, fetchNews } from "./news/news.job.js";
import { fetchQuote, fetchQuoteBatch, fetchQuoteCombine, searchYahoo } from "./quotes/quote.job.js";

export class YahooService implements MarketDataProvider {
  search(query: string): Promise<MarketDataResult<SearchResult[]>> {
    return searchYahoo(query);
  }

  quote(symbol: string): Promise<MarketDataResult<Quote>> {
    return fetchQuote(symbol);
  }

  quoteBatch(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
    return fetchQuoteBatch(symbols);
  }

  fundamentals(symbol: string): Promise<MarketDataResult<any>> {
    return fetchFundamentals(symbol);
  }

  marketInfo(symbol: string): Promise<MarketDataResult<AssetMarketInfo>> {
    return fetchMarketInfo(symbol);
  }

  quoteCombine(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
    return fetchQuoteCombine(symbols);
  }

  history(symbol: string, range: RangeKey): Promise<MarketDataResult<HistoryPoint[]>> {
    return fetchHistory(symbol, range, (key) => this.quote(key));
  }

  dividends(symbol: string): Promise<MarketDataResult<DividendEvent[]>> {
    return fetchDividends(symbol, (key) => this.quote(key));
  }

  news(symbol: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
    return fetchNews(symbol, languages);
  }

  companyNews(symbol: string, companyName: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
    return fetchCompanyNews(symbol, companyName, languages);
  }

  globalNews(page: number, languages?: NewsLanguage[]): Promise<NewsFeedPage> {
    return fetchGlobalNews(page, languages);
  }
}
