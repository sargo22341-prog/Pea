/**
 * Role du fichier : declarer les routes de donnees marche simples.
 */

import express from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { dividendsService } from "../../services/market/dividends.service.js";
import { chartRefreshService } from "../../services/market/chart-refresh.service.js";
import { marketEventsService } from "../../services/market/market-events.service.js";
import { marketDataService } from "../../services/market/market-data.service.js";
import { marketSnapshotService } from "../../services/market/market-snapshot.service.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";

export const marketRouter = express.Router();

function intradayDebugClock(range: string) {
  if (range !== "1d" || !config.debugDate) return undefined;
  return {
    forceIntradayOpen: true,
    intradayNow: config.debugDate
  };
}

marketRouter.get("/quote/:symbol", asyncRoute(async (req, res) => {
  const symbol = routeParam(req.params.symbol, "symbol");
  if (config.enableMarketLiveRefresh) {
    const snapshot = marketSnapshotService.readSnapshotBySymbol(symbol);
    if (snapshot) {
      res.json(snapshot);
      return;
    }
  }
  res.json(await marketSnapshotService.getQuote(symbol));
}));

marketRouter.get("/market/features", (_req, res) => {
  res.json({
    liveRefreshEnabled: config.enableMarketLiveRefresh
  });
});

marketRouter.get("/market/events", (req, res) => {
  marketEventsService.connect(req.user!.id, res);
});

marketRouter.post("/market/chart-refresh", asyncRoute(async (req, res) => {
  const body = z.discriminatedUnion("scope", [
    z.object({ scope: z.literal("asset"), symbol: z.string().min(1), range: z.literal("1d").default("1d"), force: z.boolean().optional() }),
    z.object({ scope: z.literal("portfolio"), range: z.literal("1d").default("1d"), force: z.boolean().optional() }),
    z.object({ scope: z.literal("watchlist"), range: z.literal("1d").default("1d"), force: z.boolean().optional() })
  ]).parse(req.body ?? {});
  const force = req.user!.role === "admin" && body.force === true;

  const result = body.scope === "watchlist"
    ? chartRefreshService.requestWatchlistRefresh({ userId: req.user!.id, range: body.range, force })
    : body.scope === "portfolio"
      ? chartRefreshService.requestPortfolioRefresh({ userId: req.user!.id, range: body.range, force })
      : await chartRefreshService.requestAssetRefreshWithInitialization({ userId: req.user!.id, symbol: body.symbol, range: body.range, scope: "asset", force });

  if (result.status === "not-found") {
    res.status(404).json(result);
    return;
  }
  res.status(result.status === "started" ? 202 : 200).json(result);
}));

marketRouter.get("/history/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  res.json(await marketDataService.getChartData(routeParam(req.params.symbol, "symbol"), range, intradayDebugClock(range)));
}));

marketRouter.get("/dividends/:symbol", asyncRoute(async (req, res) => {
  res.json(dividendsService.readDividends(routeParam(req.params.symbol, "symbol")));
}));
