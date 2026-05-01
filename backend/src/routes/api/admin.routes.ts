/**
 * Role du fichier : declarer les routes d'administration des donnees marche.
 */

import express from "express";
import { z } from "zod";
import { assetRepository } from "../../services/market/asset.repository.js";
import { dataConstructionQueue } from "../../services/market/data-construction-queue.service.js";
import { marketDataCleaner } from "../../services/market/market-data-cleaner.js";
import { asyncRoute } from "../shared/async-route.js";

export const adminRouter = express.Router();

const rebuildMarketDataSchema = z.object({
  range: z.enum(["1d", "1w", "1m", "all", "all_ranges"])
});

adminRouter.get("/admin/market-data/construction", asyncRoute(async (_req, res) => {
  res.json(dataConstructionQueue.latest());
}));

adminRouter.post("/admin/market-data/refresh-snapshots", asyncRoute(async (_req, res) => {
  res.json(dataConstructionQueue.enqueueForSymbols("snapshot", assetRepository.listTrackedSymbols()));
}));

adminRouter.post("/admin/market-data/rebuild", asyncRoute(async (req, res) => {
  const body = rebuildMarketDataSchema.parse(req.body);
  res.json(marketDataCleaner.rebuildMarketData({ range: body.range }));
}));

adminRouter.post("/admin/market-data/rebuild-all", asyncRoute(async (_req, res) => {
  res.json(marketDataCleaner.rebuildMarketData({ range: "all_ranges" }));
}));

adminRouter.post("/admin/market-data/refresh-financials", asyncRoute(async (_req, res) => {
  res.json(dataConstructionQueue.enqueueForSymbols("financials", assetRepository.listTrackedSymbols()));
}));

adminRouter.post("/admin/market-data/refresh-dividends", asyncRoute(async (_req, res) => {
  res.json(dataConstructionQueue.enqueueForSymbols("dividends", assetRepository.listTrackedSymbols()));
}));
