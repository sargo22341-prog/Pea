import express from "express";
import { z } from "zod";
import type { AssetDetails, DividendEvent, EnrichedSearchResult, HistoryPoint, Quote } from "@pea/shared";
import { HttpError } from "../utils/http-error.js";
import { parseRange } from "../utils/range.js";
import { dividendService } from "../services/dividend.service.js";
import { portfolioService } from "../services/portfolio.service.js";
import { isMarketDataUnavailable, yahooService } from "../services/yahoo.service.js";
import { watchlistService } from "../services/watchlist.service.js";
import { db } from "../db.js";
import { evaluatePeaEligibility, rankAssetForPea, sortAssetsForPea } from "../services/peaEligibility.js";
import { marketDebug, marketDebugLogPath } from "../utils/market-debug.js";

export const apiRouter = express.Router();

const asyncRoute =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

apiRouter.get("/search/enriched", asyncRoute(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) throw new HttpError(400, "Le paramètre q est requis");

  const result = await yahooService.search(q);
  const enriched = await Promise.all(
    result.data.filter((item) => typeof item.symbol === "string" && item.symbol.trim()).map(async (item): Promise<EnrichedSearchResult> => {
      const symbol = item.symbol.toUpperCase();
      let quote: Quote | undefined;
      let history: HistoryPoint[] = [];
      let marketDataUnavailable = false;

      try {
        quote = (await yahooService.quote(symbol)).data;
      } catch (error) {
        if (!isMarketDataUnavailable(error)) throw error;
        marketDataUnavailable = true;
      }

      try {
        history = (await yahooService.history(symbol, "1d")).data;
      } catch (error) {
        if (!isMarketDataUnavailable(error)) throw error;
        marketDataUnavailable = true;
      }

      const asset = {
        ...item,
        currency: quote?.currency ?? item.currency,
        exchange: quote?.exchange ?? item.exchange,
        name: quote?.name ?? item.name
      };

      return {
        ...asset,
        price: quote?.price,
        regularMarketChangePercent: quote?.changePercent,
        isInWatchlist: Boolean(db.prepare("SELECT 1 FROM watchlist WHERE symbol = ?").get(symbol)),
        isInPortfolio: Boolean(db.prepare("SELECT 1 FROM positions WHERE symbol = ?").get(symbol)),
        peaEligibility: evaluatePeaEligibility(asset),
        peaRank: rankAssetForPea(asset),
        history,
        stale: result.stale || quote?.stale || history.some((point) => point.stale),
        marketDataUnavailable: marketDataUnavailable || quote?.unavailable
      };
    })
  );

  res.json(sortAssetsForPea(enriched));
}));

apiRouter.get("/search", asyncRoute(async (req, res) => {
  const result = await yahooService.search(String(req.query.q ?? ""));
  res.json(sortAssetsForPea(result.data).map((item) => ({ ...item, stale: result.stale })));
}));

apiRouter.get("/quote/:symbol", asyncRoute(async (req, res) => {
  const result = await yahooService.quote(req.params.symbol);
  res.json(result.data);
}));

apiRouter.get("/history/:symbol", asyncRoute(async (req, res) => {
  const result = await yahooService.history(req.params.symbol, parseRange(req.query.range));
  res.json(result.data);
}));

apiRouter.get("/dividends/:symbol", asyncRoute(async (req, res) => {
  const result = await yahooService.dividends(req.params.symbol);
  res.json(result.data);
}));

apiRouter.get("/portfolio", asyncRoute(async (_req, res) => {
  res.json(await portfolioService.summary());
}));

apiRouter.post("/portfolio/positions", asyncRoute(async (req, res) => {
  const body = z
    .object({
      symbol: z.string(),
      name: z.string().optional(),
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR"),
      purchaseDate: z.string().optional()
    })
    .parse(req.body);

  res.status(201).json(await portfolioService.createPosition(body));
}));

apiRouter.put("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const body = z
    .object({
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR"),
      purchaseDate: z.string().optional(),
      notes: z.string().optional()
    })
    .parse(req.body);

  res.json(await portfolioService.updatePosition(id, body));
}));

apiRouter.delete("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const deleted = portfolioService.deletePosition(id);
  if (!deleted) throw new HttpError(404, "Position introuvable");
  res.status(204).send();
}));

apiRouter.get("/portfolio/performance", asyncRoute(async (req, res) => {
  res.json(await portfolioService.performance(parseRange(req.query.range)));
}));

apiRouter.get("/portfolio/dividends", asyncRoute(async (_req, res) => {
  res.json(await dividendService.portfolioDividends());
}));

apiRouter.get("/watchlist", asyncRoute(async (_req, res) => {
  res.json(await watchlistService.list());
}));

apiRouter.post("/watchlist/:symbol", asyncRoute(async (req, res) => {
  const body = z
    .object({
      name: z.string().optional(),
      exchange: z.string().optional(),
      currency: z.string().optional()
    })
    .partial()
    .parse(req.body ?? {});

  res.status(201).json(await watchlistService.add(req.params.symbol, body));
}));

apiRouter.delete("/watchlist/:symbol", asyncRoute(async (req, res) => {
  const deleted = watchlistService.remove(req.params.symbol);
  if (!deleted) throw new HttpError(404, "Actif absent de la liste de suivi");
  res.status(204).send();
}));

apiRouter.get("/assets/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  const symbol = req.params.symbol.toUpperCase();
  const position = await portfolioService.getPosition(symbol);
  let marketUnavailable = false;

  let quote: Quote;
  try {
    quote = (await yahooService.quote(symbol)).data;
  } catch (error) {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
    quote = {
      symbol,
      name: position?.name ?? symbol,
      price: position?.averageBuyPrice ?? 0,
      currency: position?.currency ?? "EUR",
      stale: true,
      unavailable: true
    };
  }

  let history: HistoryPoint[] = [];
  try {
    history = (await yahooService.history(symbol, range)).data;
  } catch (error) {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
  }

  if (range === "1d") {
    marketDebug("api:assets:history", {
      symbol,
      range,
      historyCount: history.length,
      first: history.slice(0, 3),
      last: history.slice(-3),
      marketUnavailable,
      logFile: marketDebugLogPath()
    });
  }

  let dividends: DividendEvent[] = [];
  try {
    dividends = (await yahooService.dividends(symbol)).data;
  } catch (error) {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
  }

  const details: AssetDetails = {
    quote,
    history,
    dividends,
    position,
    stale: marketUnavailable || quote.stale || history.some((point) => point.stale) || dividends.some((event) => event.stale) || position?.quote?.stale,
    peaEligibility: evaluatePeaEligibility({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    peaRank: rankAssetForPea({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    summary: {
      exchange: quote.exchange,
      marketState: quote.marketState,
      dividendYield: quote.dividendYield,
      dividendRate: quote.dividendRate
    }
  };

  res.json(details);
}));

apiRouter.use((req) => {
  throw new HttpError(404, `Route API introuvable: ${req.method} ${req.path}`);
});
