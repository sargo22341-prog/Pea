/**
 * Role du fichier : declarer les routes de donnees marche simples.
 */

import express from "express";
import { config } from "../../config.js";
import { dividendsService } from "../../services/market/dividends.service.js";
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
    liveRefreshEnabled: config.enableMarketLiveRefresh,
    sseEnabled: config.enableMarketSse
  });
});

marketRouter.get("/market/events", (req, res) => {
  marketEventsService.connect(req.user!.id, res);
});

marketRouter.get("/history/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  res.json(await marketDataService.getChartData(routeParam(req.params.symbol, "symbol"), range, intradayDebugClock(range)));
}));

marketRouter.get("/dividends/:symbol", asyncRoute(async (req, res) => {
  res.json(dividendsService.readDividends(routeParam(req.params.symbol, "symbol")));
}));
