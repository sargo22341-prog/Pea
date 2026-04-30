/**
 * Role du fichier : declarer les routes de donnees marche simples.
 */

import express from "express";
import { dividendsService } from "../../services/market/dividends.service.js";
import { marketDataService } from "../../services/market/market-data.service.js";
import { marketSnapshotService } from "../../services/market/market-snapshot.service.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";

export const marketRouter = express.Router();

marketRouter.get("/quote/:symbol", asyncRoute(async (req, res) => {
  res.json(await marketSnapshotService.getQuote(req.params.symbol));
}));

marketRouter.get("/history/:symbol", asyncRoute(async (req, res) => {
  res.json(await marketDataService.getChartData(req.params.symbol, parseRange(req.query.range)));
}));

marketRouter.get("/dividends/:symbol", asyncRoute(async (req, res) => {
  res.json(dividendsService.readDividends(req.params.symbol));
}));
