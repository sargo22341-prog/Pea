import express from "express";
import type { EnrichedSearchResult } from "@pea/shared";
import { watchlistRepository } from "../../repositories/assets/watchlist.repository.js";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { localPeaSearchService } from "../../services/assets/local-pea-search.service.js";
import { marketDataGateway } from "../../services/market/data/market-data-gateway.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { asyncRoute } from "../shared/async-route.js";

export const searchRouter = express.Router();

searchRouter.get("/search/enriched", asyncRoute(async (req, res) => {
  const totalStartedAt = performance.now();
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) throw new HttpError(400, "Le paramètre q est requis");

  if (req.user?.localPeaSearchEnabled) {
    const localStartedAt = performance.now();
    const enriched = localPeaSearchService.search(q, req.user.id);
    logger.debug("search", "local PEA search", { q, results: enriched.length, totalMs: Math.round(performance.now() - localStartedAt) });
    res.json(enriched);
    return;
  }

  const searchStartedAt = performance.now();
  const result = await marketDataGateway.search(q);
  const searchMs = performance.now() - searchStartedAt;
  const items = result.data.filter((item) => typeof item.symbol === "string" && item.symbol.trim());
  const symbols = items.map((item) => item.symbol.trim().toUpperCase());

  const quoteStartedAt = performance.now();
  const quotes = await marketDataGateway.readCombinedQuotesWithCache(symbols);
  const quoteMs = performance.now() - quoteStartedAt;
  const quoteBySymbol = new Map(quotes.data.map((quote) => [quote.symbol.toUpperCase(), quote]));

  const dbStartedAt = performance.now();
  const watchlistSymbols = new Set(watchlistRepository.symbols(req.user!.id));
  const portfolioSymbols = new Set(portfolioRepository.positionSymbols(req.user!.id));
  const dbMs = performance.now() - dbStartedAt;

  const enriched: EnrichedSearchResult[] = items.map((item) => {
    const symbol = item.symbol.trim().toUpperCase();
    const quote = quoteBySymbol.get(symbol);
    return {
      symbol,
      name: quote?.name ?? item.name,
      exchange: quote?.exchange ?? item.exchange,
      quoteType: quote?.quoteType ?? item.quoteType,
      currency: quote?.currency ?? item.currency,
      price: quote?.price,
      regularMarketChangePercent: quote?.changePercent,
      isInWatchlist: watchlistSymbols.has(symbol),
      isInPortfolio: portfolioSymbols.has(symbol)
    };
  });

  logger.debug("search", "search timing", {
    q,
    results: enriched.length,
    searchMs: Math.round(searchMs),
    quoteMs: Math.round(quoteMs),
    dbMs: Math.round(dbMs),
    totalMs: Math.round(performance.now() - totalStartedAt)
  });

  res.json(enriched);
}));

searchRouter.get("/search", asyncRoute(async (req, res) => {
  const result = await marketDataGateway.search(String(req.query.q ?? ""));
  res.json(result.data.map((item) => ({ ...item, stale: result.stale })));
}));
