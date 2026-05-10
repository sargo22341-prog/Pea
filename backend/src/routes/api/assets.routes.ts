/**
 * Role du fichier : declarer la route de details complets d'un actif.
 */

import express from "express";
import type { AssetDetails, AssetMarketInfo, DividendEvent, NewsArticle, Quote } from "@pea/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { currentUserId } from "../../services/auth/user-context.js";
import { assetDataService } from "../../services/assets/asset-data.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { dividendsService } from "../../services/market/dividends.service.js";
import { financialsService } from "../../services/market/financials.service.js";
import { getMarketSessionInfo } from "../../services/market/marketCalendar.service.js";
import { marketSnapshotService } from "../../services/market/market-snapshot.service.js";
import { portfolioService } from "../../services/portfolio/portfolio.service.js";
import { evaluatePeaEligibility, rankAssetForPea } from "../../services/assets/peaEligibility.js";
import { isMarketDataUnavailable, yahooService } from "../../services/yahoo/index.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";
import { userNewsLanguages } from "../shared/news.helpers.js";

export const assetsRouter = express.Router();

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

assetsRouter.get("/assets/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  const symbol = routeParam(req.params.symbol, "symbol").toUpperCase();
  const positionPromise = portfolioService.getPosition(symbol);
  const watchlistRow = db.prepare("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?").get(currentUserId(), symbol);
  let marketUnavailable = false;

  const position = await positionPromise;

  const quoteResult = await marketSnapshotService.getQuote(symbol).then((quote) => ({ data: quote })).catch((error) => {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
    return {
      data: {
        symbol,
        name: position?.name ?? symbol,
        price: position?.averageBuyPrice ?? 0,
        currency: position?.currency ?? "EUR",
        stale: true,
        unavailable: true
      } satisfies Quote
    };
  });
  const quote: Quote = quoteResult.data;

  const [assetStatic, assetChart, assetDividends, assetArticles, assetMarket, dividendsResult, newsResult, marketInfoResult, assetFinancialsResult, extraDataResult] = await Promise.all([
    assetDataService.static(symbol),
    assetDataService.chart(symbol, range, config.enableMarketLiveRefresh ? {} : intradayDebugClock(range)),
    assetDataService.dividends(symbol),
    req.user!.assetNewsEnabled && !config.enableMarketLiveRefresh ? assetDataService.articles(symbol, userNewsLanguages(req)) : Promise.resolve(undefined),
    assetDataService.market(symbol),
    Promise.resolve({ data: dividendsService.readDividends(symbol) }).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return { data: [] as DividendEvent[] };
    }),
    req.user!.assetNewsEnabled && !config.enableMarketLiveRefresh
      ? yahooService.news(symbol, userNewsLanguages(req)).catch((error) => {
          logger.warn("news", "asset news fallback", { symbol, error: error instanceof Error ? error.message : String(error) });
          return { data: [] as NewsArticle[] };
        })
      : Promise.resolve({ data: [] as NewsArticle[] }),
    config.enableMarketLiveRefresh
      ? Promise.resolve({ data: {} as AssetMarketInfo })
      : yahooService.marketInfo(symbol).catch((error) => {
          if (!isMarketDataUnavailable(error)) throw error;
          marketUnavailable = true;
          return { data: {} as AssetMarketInfo };
        }),
    Promise.resolve({ financials: financialsService.readFinancialRows(symbol) as AssetDetails["financials"], isEtf: String(quote.quoteType ?? "").toUpperCase().includes("ETF") }),
    config.enableMarketLiveRefresh
      ? Promise.resolve({ data: {} })
      : yahooService.extraData(symbol).catch((error) => {
          logger.warn("market-data", "extraData fallback", { symbol, error: error instanceof Error ? error.message : String(error) });
          return { data: {} };
        })
  ]);

  const history: AssetDetails["history"] = [];
  const dividends = dividendsResult.data;
  const news = newsResult.data;
  const marketInfo = marketInfoResult.data;
  const freshMarketPrice = firstPrice(assetMarket.regularMarketPrice, quote.unavailable ? undefined : quote.price, marketInfo.regularMarketPrice);
  const analystConsensus = (extraDataResult.data as any).analystConsensus;
  logDividendDesync(symbol, dividends, marketInfo);
  const marketSession = getMarketSessionInfo(symbol, quote.exchange ?? marketInfo.exchangeName ?? assetStatic.exchange);
  const financials = assetFinancialsResult.financials;
  const isEtf = assetFinancialsResult.isEtf;
  const dividendsReceived = position
    ? dividends.reduce((sum, event) => {
        if (new Date(event.date).getTime() > Date.now()) return sum;
        const quantity = portfolioService.hasDatedTransactions(position.id)
          ? portfolioService.getQuantityHeldAtDate(position.id, event.date)
          : position.quantity;
        return sum + quantity * event.amount;
      }, 0)
    : 0;

  const details: AssetDetails = {
    quote,
    history,
    chart: assetChart,
    dividends,
    dividendsDto: assetDividends,
    news,
    articlesDto: assetArticles,
    position,
    userAssetPosition: assetDataService.userPosition(String(req.user!.id), symbol),
    positionStats: position ? portfolioService.transactionStats(position.id, dividendsReceived, position.currency) : undefined,
    isInWatchlist: Boolean(watchlistRow),
    stale: marketUnavailable || quote.stale || dividends.some((event) => event.stale) || position?.quote?.stale,
    peaEligibility: evaluatePeaEligibility({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    peaRank: rankAssetForPea({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    summary: {
      exchange: assetStatic.exchange || quote.exchange,
      marketState: assetMarket.marketState,
      dividendYield: assetMarket.dividendYield ?? quote.dividendYield,
      dividendRate: assetMarket.annualDividend ?? quote.dividendRate
    },
    marketInfo: {
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
      currency: assetMarket.currency ?? marketInfo.currency,
      exchangeName: assetMarket.exchangeName ?? marketInfo.exchangeName
    },
    market: assetMarket,
    appTimezone: config.appTimezone,
    marketSession,
    financials,
    isEtf,
    calendarEventsData: (extraDataResult.data as any).calendarEventsData,
    analystConsensus: analystConsensus
      ? { ...analystConsensus, ...(freshMarketPrice === undefined ? {} : { currentPrice: freshMarketPrice }) }
      : undefined,
    fundDetails: (extraDataResult.data as any).fundDetails
  };

  res.json(details);
}));

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
