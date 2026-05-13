import express from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { dataConstructionQueue } from "../../services/market/construction/data-construction-queue.service.js";
import { marketDataCleaner } from "../../services/market/construction/market-data-cleaner.js";
import { invalidateUserAssetCaches } from "../../services/shared/cache.service.js";
import { marketScheduler } from "../../schedulers/market-scheduler.service.js";
import { trackedMarketRepository } from "../../repositories/market/tracked-market.repository.js";
import { yahooUsageService } from "../../services/yahoo/yahoo-usage.service.js";
import { HttpError } from "../../utils/http-error.js";
import { asyncRoute } from "../shared/async-route.js";

export const adminRouter = express.Router();

const rebuildMarketDataSchema = z.object({
  range: z.enum(["1d", "1w", "1m", "all", "all_ranges"])
});

const yahooUsageQuerySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  method: z.string().trim().min(1).optional(),
  module: z.string().trim().min(1).optional(),
  ticker: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  success: z
    .enum(["true", "false", "1", "0"])
    .transform((value) => value === "true" || value === "1")
    .optional(),
  groupBy: z.enum(["hour", "day", "method", "module", "ticker"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

adminRouter.get("/admin/market-data/construction", asyncRoute(async (_req, res) => {
  res.json(dataConstructionQueue.latest());
}));

adminRouter.get("/admin/market-data/tracked-markets", asyncRoute(async (_req, res) => {
  res.json(marketScheduler.getSettings());
}));

adminRouter.delete("/admin/market-data/tracked-markets/:marketKey", asyncRoute(async (req, res) => {
  const marketKey = z.string().trim().min(1).max(80).parse(req.params.marketKey);
  const result = trackedMarketRepository.removeUnused(marketKey);
  if (!result.removed) {
    if (result.reason === "not_found") throw new HttpError(404, "Bourse introuvable.");
    throw new HttpError(409, "Cette bourse contient encore des assets suivis.");
  }
  res.json({ marketKey, ...result.cleanup });
}));

adminRouter.get("/admin/yahoo-usage/stats", asyncRoute(async (req, res) => {
  const query = yahooUsageQuerySchema.parse(req.query);
  res.json(yahooUsageService.stats(query));
}));

adminRouter.get("/admin/yahoo-usage/calls", asyncRoute(async (req, res) => {
  const query = yahooUsageQuerySchema.parse(req.query);
  res.json(yahooUsageService.list(query));
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
