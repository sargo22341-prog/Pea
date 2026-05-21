import type {
  AssetDetails,
  AssetMarketInfo,
  DividendEvent,
  NewsArticle,
  NewsLanguage,
  Quote,
  RangeKey
} from "@pea/shared";
import { config } from "../../config.js";
import { watchlistRepository } from "../../repositories/assets/watchlist.repository.js";
import { currentUserId } from "../auth/user-context.js";
import { getMarketSessionInfo } from "../market/calendars/marketCalendar.service.js";
import { dividendsService } from "../market/dividends/dividends.service.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { financialsService } from "../market/financials/financials.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { logger } from "../shared/logger.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { readCachedExtraData } from "../yahoo/fundamentals/fundamentals.job.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { assetDataService } from "./asset-data.service.js";
import { evaluatePeaEligibility, rankAssetForPea } from "./peaEligibility.js";
import type { AuthUser } from "../auth/auth.service.js";

type ExtraAssetData = Partial<Pick<AssetDetails, "calendarEventsData" | "analystConsensus" | "fundDetails">>;

interface AssembleInput {
  symbol: string;
  range: RangeKey;
  user: AuthUser;
  newsLanguages: NewsLanguage[];
}

interface SectionResult<T> {
  data: T;
  marketUnavailable?: boolean;
}

function finiteNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function firstMarketNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = finiteNumber(value);
    if (numberValue !== undefined) return numberValue;
  }
  return undefined;
}

function firstPrice(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = finiteNumber(value);
    if (numberValue !== undefined && numberValue > 0) return numberValue;
  }
  return undefined;
}

function intradayDebugClock(range: string) {
  if (range !== "1d" || !config.debugDate) return undefined;
  return {
    forceIntradayOpen: true,
    intradayNow: config.debugDate
  };
}

function shouldQueueAnnexRefresh(input: {
  dividends: DividendEvent[];
  extraData: ExtraAssetData;
  financials: AssetDetails["financials"];
  isEtf: boolean;
  marketInfo?: AssetMarketInfo;
  quote: Quote;
}) {
  const hasDividendSignal = firstMarketNumber(
    input.marketInfo?.dividendRate,
    input.marketInfo?.dividendYield,
    input.quote.dividendRate,
    input.quote.dividendYield
  ) !== undefined;
  const hasFinancials = Boolean(input.financials?.length);
  const hasExtraData = Boolean(input.extraData.calendarEventsData || input.extraData.analystConsensus || input.extraData.fundDetails);

  if (input.isEtf && !input.extraData.fundDetails) return true;
  if (!input.isEtf && !hasFinancials) return true;
  if (hasDividendSignal && input.dividends.length === 0) return true;
  return !hasExtraData;
}

class PortfolioSection {
  async load(symbol: string, range: RangeKey, user: AuthUser, dividends: DividendEvent[], fallbackQuote?: Quote) {
    const position = await portfolioService.getPosition(symbol);
    const positionRangePerformance = position
      ? await portfolioService.singlePositionPerformance(position.id, range).catch((error) => {
          logger.warn("portfolio", "asset position range performance unavailable", {
            symbol,
            range,
            error: error instanceof Error ? error.message : String(error)
          });
          return undefined;
        })
      : undefined;
    const dividendsReceived = position
      ? dividends.reduce((sum, event) => {
          if (new Date(event.date).getTime() > Date.now()) return sum;
          const quantity = portfolioService.hasDatedTransactions(position.id)
            ? portfolioService.getQuantityHeldAtDate(position.id, event.date)
            : position.quantity;
          return sum + quantity * event.amount;
        }, 0)
      : 0;

    return {
      position,
      positionRangePerformance,
      userAssetPosition: assetDataService.userPosition(String(user.id), symbol),
      positionStats: position ? portfolioService.transactionStats(position.id, dividendsReceived, position.currency) : undefined,
      quoteFallback: fallbackQuote ?? positionToUnavailableQuote(symbol, position)
    };
  }
}

class MarketSection {
  async load(symbol: string, range: RangeKey, user: AuthUser, positionFallbackQuote: Quote): Promise<SectionResult<{
    quote: Quote;
    assetStatic: Awaited<ReturnType<typeof assetDataService.static>>;
    assetChart: Awaited<ReturnType<typeof assetDataService.chart>>;
    assetMarket: Awaited<ReturnType<typeof assetDataService.market>>;
    marketInfo: AssetMarketInfo;
    marketSession: AssetDetails["marketSession"];
  }>> {
    let marketUnavailable = false;
    const quote = await marketSnapshotService.getQuote(symbol).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return positionFallbackQuote;
    });

    const [assetStatic, assetChart, assetMarket, marketInfoResult] = await Promise.all([
      assetDataService.static(symbol),
      assetDataService.chart(symbol, range, config.enableMarketLiveRefresh ? {} : intradayDebugClock(range)),
      assetDataService.market(symbol),
      config.enableMarketLiveRefresh
        ? Promise.resolve({ data: {} as AssetMarketInfo })
        : marketDataGateway.readMarketInfoWithCache(symbol).catch((error) => {
            if (!isMarketDataUnavailable(error)) throw error;
            marketUnavailable = true;
            return { data: {} as AssetMarketInfo };
          })
    ]);

    const marketInfo = marketInfoResult.data;
    return {
      data: {
        quote,
        assetStatic,
        assetChart,
        assetMarket,
        marketInfo,
        marketSession: getMarketSessionInfo(symbol, quote.exchange ?? marketInfo.exchangeName ?? assetStatic.exchange)
      },
      marketUnavailable
    };
  }

  mergeMarketInfo(assetMarket: Awaited<ReturnType<typeof assetDataService.market>>, quote: Quote, marketInfo: AssetMarketInfo): AssetMarketInfo {
    const freshMarketPrice = firstPrice(assetMarket.regularMarketPrice, quote.unavailable ? undefined : quote.price, marketInfo.regularMarketPrice);
    return {
      ...marketInfo,
      marketState: assetMarket.marketState,
      regularMarketPrice: freshMarketPrice,
      regularMarketChange: firstMarketNumber(assetMarket.dayChange, marketInfo.regularMarketChange),
      regularMarketChangePercent: firstMarketNumber(assetMarket.dayChangePercent, marketInfo.regularMarketChangePercent),
      regularMarketTime: assetMarket.regularMarketTime ?? marketInfo.regularMarketTime,
      regularMarketPreviousClose: firstPrice(assetMarket.previousClose, quote.previousClose, marketInfo.regularMarketPreviousClose),
      regularMarketOpen: firstPrice(assetMarket.openPrice, marketInfo.regularMarketOpen),
      regularMarketDayHigh: firstPrice(assetMarket.dayHigh, marketInfo.regularMarketDayHigh),
      regularMarketDayLow: firstPrice(assetMarket.dayLow, marketInfo.regularMarketDayLow),
      regularMarketVolume: firstMarketNumber(assetMarket.volume, marketInfo.regularMarketVolume),
      bid: firstPrice(assetMarket.bid, marketInfo.bid),
      ask: firstPrice(assetMarket.ask, marketInfo.ask),
      fiftyTwoWeekLow: firstPrice(assetMarket.week52Low, marketInfo.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: firstPrice(assetMarket.week52High, marketInfo.fiftyTwoWeekHigh),
      averageDailyVolume3Month: firstMarketNumber(assetMarket.avgVolume3M, marketInfo.averageDailyVolume3Month),
      dividendRate: firstMarketNumber(assetMarket.annualDividend, marketInfo.dividendRate),
      dividendYield: firstMarketNumber(assetMarket.dividendYield, marketInfo.dividendYield),
      exDividendDate: assetMarket.exDividendDate ?? marketInfo.exDividendDate,
      currency: assetMarket.currency ?? marketInfo.currency,
      exchangeName: assetMarket.exchangeName ?? marketInfo.exchangeName
    };
  }
}

class NewsSection {
  async load(symbol: string, user: AuthUser, languages: NewsLanguage[]): Promise<{
    articlesDto: AssetDetails["articlesDto"];
    news: NewsArticle[];
  }> {
    if (!user.assetNewsEnabled || config.enableMarketLiveRefresh) return { articlesDto: undefined, news: [] };

    const [articlesDto, newsResult] = await Promise.all([
      assetDataService.articles(symbol, languages),
      marketDataGateway.readNewsWithCache(symbol, languages).catch((error) => {
        logger.warn("news", "asset news fallback", {
          symbol,
          error: error instanceof Error ? error.message : String(error)
        });
        return { data: [] as NewsArticle[] };
      })
    ]);
    return { articlesDto, news: newsResult.data };
  }
}

class FundamentalsSection {
  async load(symbol: string, quote: Quote): Promise<{
    assetDividends: AssetDetails["dividendsDto"];
    dividends: DividendEvent[];
    financials: AssetDetails["financials"];
    isEtf: boolean;
    extraData: ExtraAssetData;
    marketUnavailable: boolean;
  }> {
    let marketUnavailable = false;
    const [assetDividends, dividendsResult, assetFinancialsResult, extraDataResult] = await Promise.all([
      assetDataService.dividends(symbol),
      Promise.resolve({ data: dividendsService.readDividends(symbol) }).catch((error) => {
        if (!isMarketDataUnavailable(error)) throw error;
        marketUnavailable = true;
        return { data: [] as DividendEvent[] };
      }),
      Promise.resolve({
        financials: financialsService.readFinancialRows(symbol) as AssetDetails["financials"],
        isEtf: String(quote.quoteType ?? "").toUpperCase().includes("ETF")
      }),
      config.enableMarketLiveRefresh
        ? Promise.resolve(readCachedExtraData(symbol) ?? { data: {} as ExtraAssetData })
        : marketDataGateway.readExtraDataWithCache(symbol).catch((error) => {
            logger.warn("market-data", "extraData fallback", {
              symbol,
              error: error instanceof Error ? error.message : String(error)
            });
            return { data: {} as ExtraAssetData };
          })
    ]);

    return {
      assetDividends,
      dividends: dividendsResult.data,
      financials: assetFinancialsResult.financials,
      isEtf: assetFinancialsResult.isEtf,
      extraData: extraDataResult.data,
      marketUnavailable
    };
  }
}

export class AssetDetailsAssembler {
  private readonly market = new MarketSection();
  private readonly portfolio = new PortfolioSection();
  private readonly news = new NewsSection();
  private readonly fundamentals = new FundamentalsSection();

  async assemble(input: AssembleInput): Promise<AssetDetails> {
    const symbol = input.symbol.toUpperCase();
    const initialPortfolio = await this.portfolio.load(symbol, input.range, input.user, []);
    const market = await this.market.load(symbol, input.range, input.user, initialPortfolio.quoteFallback);
    const fundamentals = await this.fundamentals.load(symbol, market.data.quote);
    const [portfolio, news] = await Promise.all([
      this.portfolio.load(symbol, input.range, input.user, fundamentals.dividends, market.data.quote),
      this.news.load(symbol, input.user, input.newsLanguages)
    ]);

    logDividendDesync(symbol, fundamentals.dividends, market.data.marketInfo);
    const mergedMarketInfo = this.market.mergeMarketInfo(market.data.assetMarket, market.data.quote, market.data.marketInfo);
    const isEtf = fundamentals.isEtf || market.data.assetStatic.type === "etf";
    const isInWatchlist = watchlistRepository.has(symbol, currentUserId());
    if (!portfolio.position && !isInWatchlist && shouldQueueAnnexRefresh({
      dividends: fundamentals.dividends,
      extraData: fundamentals.extraData,
      financials: fundamentals.financials,
      isEtf,
      marketInfo: mergedMarketInfo,
      quote: market.data.quote
    })) {
      dataConstructionQueue.enqueueAnnexRefreshIfNotRecentlyQueued(symbol);
    }
    const analystConsensus = fundamentals.extraData.analystConsensus
      ? {
          ...fundamentals.extraData.analystConsensus,
          ...(mergedMarketInfo.regularMarketPrice === undefined ? {} : { currentPrice: mergedMarketInfo.regularMarketPrice })
        }
      : undefined;

    return {
      quote: market.data.quote,
      history: [],
      chart: market.data.assetChart,
      dividends: fundamentals.dividends,
      dividendsDto: fundamentals.assetDividends,
      news: news.news,
      articlesDto: news.articlesDto,
      position: portfolio.position,
      positionRangePerformance: portfolio.positionRangePerformance,
      userAssetPosition: portfolio.userAssetPosition,
      positionStats: portfolio.positionStats,
      isInWatchlist,
      stale: Boolean(
        market.marketUnavailable ||
        fundamentals.marketUnavailable ||
        market.data.quote.stale ||
        fundamentals.dividends.some((event) => event.stale) ||
        portfolio.position?.quote?.stale
      ),
      peaEligibility: evaluatePeaEligibility({ ...market.data.quote, quoteType: String(market.data.quote.quoteType ?? "") }),
      peaRank: rankAssetForPea({ ...market.data.quote, quoteType: String(market.data.quote.quoteType ?? "") }),
      summary: {
        exchange: market.data.assetStatic.exchange || market.data.quote.exchange,
        marketState: market.data.assetMarket.marketState,
        dividendYield: market.data.assetMarket.dividendYield ?? market.data.quote.dividendYield,
        dividendRate: market.data.assetMarket.annualDividend ?? market.data.quote.dividendRate
      },
      marketInfo: mergedMarketInfo,
      market: market.data.assetMarket,
      appTimezone: config.appTimezone,
      marketSession: market.data.marketSession,
      financials: fundamentals.financials,
      isEtf,
      calendarEventsData: fundamentals.extraData.calendarEventsData,
      analystConsensus,
      fundDetails: fundamentals.extraData.fundDetails
    };
  }
}

function positionToUnavailableQuote(symbol: string, position?: Awaited<ReturnType<typeof portfolioService.getPosition>>): Quote {
  return {
    symbol,
    name: position?.name ?? symbol,
    price: position?.averageBuyPrice ?? 0,
    currency: position?.currency ?? "EUR",
    stale: true,
    unavailable: true
  };
}

function logDividendDesync(symbol: string, dividends: DividendEvent[], marketInfo?: AssetMarketInfo) {
  if (!logger.isDebugEnabled() || !marketInfo?.exDividendDate || !Number.isFinite(marketInfo.dividendRate)) return;
  const marketExDate = new Date(marketInfo.exDividendDate);
  if (!Number.isFinite(marketExDate.getTime())) return;
  const currentYear = new Date().getUTCFullYear();
  if (marketExDate.getUTCFullYear() !== currentYear) {
    logger.debug("market-data", "market dividend ex-date is outside current year", {
      symbol,
      exDividendDate: marketInfo.exDividendDate,
      dividendRate: marketInfo.dividendRate,
      currentYear,
      latestDividendDate: dividends.at(-1)?.date
    });
    return;
  }
  const hasMatchingEvent = dividends.some((event) => sameUtcDay(event.date, marketExDate));
  if (hasMatchingEvent) return;
  logger.debug("market-data", "market dividend not present in dividend history", {
    symbol,
    exDividendDate: marketInfo.exDividendDate,
    dividendRate: marketInfo.dividendRate,
    latestDividendDate: dividends.at(-1)?.date
  });
}

function sameUtcDay(value: string, expected: Date) {
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === expected.getUTCFullYear() &&
    date.getUTCMonth() === expected.getUTCMonth() &&
    date.getUTCDate() === expected.getUTCDate()
  );
}

export const assetDetailsAssembler = new AssetDetailsAssembler();
