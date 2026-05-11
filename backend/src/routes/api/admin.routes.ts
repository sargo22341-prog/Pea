/**
 * Role du fichier : declarer les routes d'administration des donnees marche.
 */

import express from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { assetRepository } from "../../services/market/asset.repository.js";
import { dataConstructionQueue } from "../../services/market/data-construction-queue.service.js";
import { marketDataCleaner } from "../../services/market/market-data-cleaner.js";
import { invalidateUserAssetCaches } from "../../services/shared/cache.service.js";
import { marketScheduler } from "../../services/tache_auto/market-scheduler.service.js";
import { asyncRoute } from "../shared/async-route.js";

export const adminRouter = express.Router();

const rebuildMarketDataSchema = z.object({
  range: z.enum(["1d", "1w", "1m", "all", "all_ranges"])
});

adminRouter.get("/admin/market-data/construction", asyncRoute(async (_req, res) => {
  res.json(dataConstructionQueue.latest());
}));

adminRouter.get("/admin/market-data/tracked-markets", asyncRoute(async (_req, res) => {
  res.json(marketScheduler.getSettings());
}));

adminRouter.post("/admin/market-data/rebuild", asyncRoute(async (req, res) => {
  const body = rebuildMarketDataSchema.parse(req.body);
  res.json(marketDataCleaner.rebuildMarketData({ range: body.range }));
}));

// Compat: historical route; the UI now posts /rebuild with range=all_ranges.
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
  db.exec("DELETE FROM asset_article_cache");
  // Blocs frontend et agregats dependants des snapshots/dividendes/fundamentals.
  invalidateUserAssetCaches("*");

  const symbols = assetRepository.listTrackedSymbols();
  const job = dataConstructionQueue.enqueueAnnexRefresh(symbols);

  res.json(job);
}));
