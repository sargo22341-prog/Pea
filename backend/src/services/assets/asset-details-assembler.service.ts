import type {
  AssetDetails,
  AssetMarketInfo,
  DividendEvent,
  NewsLanguage,
  RangeKey
} from "@pea/shared";
import { config } from "../../config.js";
import { watchlistRepository } from "../../repositories/assets/watchlist.repository.js";
import { currentUserId } from "../auth/user-context.js";
import { logger } from "../shared/logger.service.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { evaluatePeaEligibility, rankAssetForPea } from "./peaEligibility.js";
import type { AuthUser } from "../auth/auth.service.js";

interface AssembleInput {
  symbol: string;
  range: RangeKey;
  user: AuthUser;
  newsLanguages: NewsLanguage[];
}

import { FundamentalsSection, MarketSection, NewsSection, PortfolioSection, shouldQueueAnnexRefresh } from "./asset-details-sections.service.js";

export class AssetDetailsAssembler {
  private readonly market = new MarketSection();
  private readonly portfolio = new PortfolioSection();
  private readonly news = new NewsSection();
  private readonly fundamentals = new FundamentalsSection();

  async assemble(input: AssembleInput): Promise<AssetDetails> {
    const symbol = input.symbol.toUpperCase();
    const initialPortfolio = await this.portfolio.load(symbol, input.range, input.user, []);
    const market = await this.market.load(symbol, input.range, initialPortfolio.quoteFallback);
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
