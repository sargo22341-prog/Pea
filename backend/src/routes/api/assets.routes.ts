/**
 * Role du fichier : declarer la route de details complets d'un actif.
 */

import express from "express";
import type { AssetDetails, AssetMarketInfo, DividendEvent, NewsArticle, Quote } from "@pea/shared";
import { db } from "../../db.js";
import { assetDataService } from "../../services/assets/asset-data.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { dividendsService } from "../../services/market/dividends.service.js";
import { financialsService } from "../../services/market/financials.service.js";
import { marketSnapshotService } from "../../services/market/market-snapshot.service.js";
import { portfolioService } from "../../services/portfolio/portfolio.service.js";
import { evaluatePeaEligibility, rankAssetForPea } from "../../services/assets/peaEligibility.js";
import { isMarketDataUnavailable, yahooService } from "../../services/yahoo/index.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";
import { userNewsLanguages } from "../shared/news.helpers.js";

export const assetsRouter = express.Router();

assetsRouter.get("/assets/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  const symbol = req.params.symbol.toUpperCase();
  const positionPromise = portfolioService.getPosition(symbol);
  const watchlistRow = db.prepare("SELECT id FROM watchlist WHERE symbol = ?").get(symbol);
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

  const [assetStatic, assetChart, assetDividends, assetArticles, assetMarket, dividendsResult, newsResult, marketInfoResult, assetFinancialsResult] = await Promise.all([
    assetDataService.static(symbol),
    assetDataService.chart(symbol, range),
    assetDataService.dividends(symbol),
    req.user!.assetNewsEnabled ? assetDataService.articles(symbol, userNewsLanguages(req)) : Promise.resolve(undefined),
    assetDataService.market(symbol),
    Promise.resolve({ data: dividendsService.readDividends(symbol) }).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return { data: [] as DividendEvent[] };
    }),
    req.user!.assetNewsEnabled
      ? yahooService.news(symbol, userNewsLanguages(req)).catch((error) => {
          logger.warn("news", "asset news fallback", { symbol, error: error instanceof Error ? error.message : String(error) });
          return { data: [] as NewsArticle[] };
        })
      : Promise.resolve({ data: [] as NewsArticle[] }),
    yahooService.marketInfo(symbol).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return { data: {} as AssetMarketInfo };
    }),
    Promise.resolve({ financials: financialsService.readFinancialRows(symbol) as AssetDetails["financials"], isEtf: String(quote.quoteType ?? "").toUpperCase().includes("ETF") })
  ]);

  const history: AssetDetails["history"] = [];
  const dividends = dividendsResult.data;
  const news = newsResult.data;
  const marketInfo = marketInfoResult.data;
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
    marketInfo,
    market: assetMarket,
    financials,
    isEtf
  };

  res.json(details);
}));
