/**
 * Role du fichier : declarer les routes d'administration des donnees marche.
 */

import express from "express";
import { z } from "zod";
import { db } from "../../db.js";
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

adminRouter.post("/admin/market-data/rebuild", asyncRoute(async (req, res) => {
  const body = rebuildMarketDataSchema.parse(req.body);
  res.json(marketDataCleaner.rebuildMarketData({ range: body.range }));
}));

adminRouter.post("/admin/market-data/rebuild-all", asyncRoute(async (_req, res) => {
  res.json(marketDataCleaner.rebuildMarketData({ range: "all_ranges" }));
}));

adminRouter.post("/admin/market-data/cleanup-unlinked-assets", asyncRoute(async (_req, res) => {
  res.json(marketDataCleaner.cleanupUnlinkedAssets());
}));

adminRouter.post("/admin/market-data/refresh-annex", asyncRoute(async (_req, res) => {
  // Purge tous les caches non-chart pour forcer un refetch complet.
  // calendarEvents, financialData, fundProfile, consensus, marketInfo...
  db.exec("DELETE FROM cached_fundamentals WHERE symbol NOT LIKE '%:annual-financials'");
  // Quotes Yahoo (prix live)
  db.exec("DELETE FROM cached_quotes");
  // Dividendes bruts Yahoo
  db.exec("DELETE FROM cached_dividends");
  // News
  db.exec("DELETE FROM cached_news");
  // DTO caches dérivés (générés à partir des tables source, doivent être invalidés
  // pour que les données fraîches des tâches snapshot/financials/dividends soient visibles)
  db.exec("DELETE FROM asset_static_cache");
  db.exec("DELETE FROM asset_market_cache");
  db.exec("DELETE FROM asset_dividend_cache");
  db.exec("DELETE FROM asset_article_cache");

  const symbols = assetRepository.listTrackedSymbols();
  const job = dataConstructionQueue.enqueueForSymbols("snapshot", symbols);
  dataConstructionQueue.enqueueForSymbols("financials", symbols);
  dataConstructionQueue.enqueueForSymbols("dividends", symbols);
  dataConstructionQueue.enqueueForSymbols("calendar-events", symbols);

  res.json(job);
}));
