import type {
  AssetAnalystConsensus,
  AssetCalendarEventsData,
  AssetFundDetails,
  AssetMarketInfo,
  DividendEvent,
  HistoryPoint,
  NewsArticle,
  NewsFeedPage,
  NewsLanguage,
  Quote,
  RangeKey,
  SearchResult
} from "@pea/shared";
import type { MarketDataResult } from "./market-data-provider.js";
import { yahooApi } from "../../yahoo/yahoo.api.js";
import { yahooService } from "../../yahoo/index.js";

/**
 * Single market-data facade for application services.
 *
 * Method names intentionally expose the freshness policy:
 * - read*WithCache uses the DTO/cache/stale-fallback Yahoo jobs.
 * - fetchFresh* uses the raw Yahoo adapter with retry/dedupe only.
 */
export class MarketDataGateway {
  search(query: string): Promise<MarketDataResult<SearchResult[]>> {
    return yahooService.search(query);
  }

  readQuoteWithCache(symbol: string): Promise<MarketDataResult<Quote>> {
    return yahooService.quote(symbol);
  }

  readQuoteBatchWithCache(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
    return yahooService.quoteBatch(symbols);
  }

  readCombinedQuotesWithCache(symbols: string[]): Promise<MarketDataResult<Quote[]>> {
    return yahooService.quoteCombine(symbols);
  }

  readHistoryWithCache(symbol: string, range: RangeKey): Promise<MarketDataResult<HistoryPoint[]>> {
    return yahooService.history(symbol, range);
  }

  readDividendsWithCache(symbol: string): Promise<MarketDataResult<DividendEvent[]>> {
    return yahooService.dividends(symbol);
  }

  readFundamentalsWithCache(symbol: string): ReturnType<typeof yahooService.fundamentals> {
    return yahooService.fundamentals(symbol);
  }

  readMarketInfoWithCache(symbol: string): Promise<MarketDataResult<AssetMarketInfo>> {
    return yahooService.marketInfo(symbol);
  }

  readExtraDataWithCache(symbol: string): Promise<MarketDataResult<{
    calendarEventsData?: AssetCalendarEventsData;
    analystConsensus?: AssetAnalystConsensus;
    fundDetails?: AssetFundDetails;
  }>> {
    return yahooService.extraData(symbol);
  }

  readNewsWithCache(symbol: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
    return yahooService.news(symbol, languages);
  }

  readCompanyNewsWithCache(symbol: string, companyName: string, languages?: NewsLanguage[]): Promise<MarketDataResult<NewsArticle[]>> {
    return yahooService.companyNews(symbol, companyName, languages);
  }

  readGlobalNewsWithCache(page: number, languages?: NewsLanguage[]): Promise<NewsFeedPage> {
    return yahooService.globalNews(page, languages);
  }

  fetchFreshQuote(symbol: string) {
    return yahooApi.quote(symbol);
  }

  fetchFreshQuoteBatch(symbols: string[]) {
    return yahooApi.quoteBatch(symbols);
  }

  fetchFreshQuoteBatchRaw(symbols: string[]) {
    return yahooApi.quoteBatchRaw(symbols);
  }

  fetchFreshQuoteSummary(symbol: string) {
    return yahooApi.quoteSummary(symbol);
  }

  fetchFreshAssetProfile(symbol: string) {
    return yahooApi.assetProfile(symbol);
  }

  fetchFreshChart(symbol: string, options: Parameters<typeof yahooApi.chart>[1]) {
    return yahooApi.chart(symbol, options);
  }

  fetchFreshFundamentalsTimeSeries(symbol: string) {
    return yahooApi.fundamentalsTimeSeries(symbol);
  }
}

export const marketDataGateway = new MarketDataGateway();
