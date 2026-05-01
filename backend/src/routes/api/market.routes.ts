/**
 * Role du fichier : declarer les routes de donnees marche simples.
 */

import express from "express";
import { config } from "../../config.js";
import { dividendsService } from "../../services/market/dividends.service.js";
import { marketDataService } from "../../services/market/market-data.service.js";
import { marketSnapshotService } from "../../services/market/market-snapshot.service.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";

export const marketRouter = express.Router();

function intradayDebugClock(range: string) {
  if (range !== "1d" || !config.debugDate) return undefined;
  return {
    forceIntradayOpen: true,
    intradayNow: config.debugDate
  };
}

marketRouter.get("/quote/:symbol", asyncRoute(async (req, res) => {
  res.json(await marketSnapshotService.getQuote(req.params.symbol));
}));

marketRouter.get("/history/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  res.json(await marketDataService.getChartData(req.params.symbol, range, intradayDebugClock(range)));
}));

marketRouter.get("/dividends/:symbol", asyncRoute(async (req, res) => {
  res.json(dividendsService.readDividends(req.params.symbol));
}));
