import express from "express";
import { z } from "zod";
import { db } from "../../db.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { unifiedCacheRepository } from "../../repositories/cache/unified-cache.repository.js";
import { dataConstructionQueue } from "../../services/market/construction/data-construction-queue.service.js";
import { marketDataCleaner } from "../../services/market/construction/market-data-cleaner.js";
import { invalidateUserAssetCaches } from "../../services/shared/cache.service.js";
import { marketScheduler } from "../../schedulers/market-scheduler.service.js";
import { trackedMarketRepository } from "../../repositories/market/tracked-market.repository.js";
import { yahooUsageService } from "../../services/yahoo/yahoo-usage.service.js";
import { runtimeHealthService } from "../../services/admin/runtime-health.service.js";
import { authService } from "../../services/auth/auth.service.js";
import { HttpError } from "../../utils/http-error.js";
import { asyncRoute } from "../shared/async-route.js";

export const adminRouter = express.Router();

const rebuildMarketDataSchema = z.object({
  range: z.enum(["1d", "1w", "1m", "all", "all_ranges"])
});

const adminCreateUserSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(10, "Le mot de passe doit contenir au moins 10 caracteres.")
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

adminRouter.get("/admin/runtime-health", asyncRoute(async (_req, res) => {
  res.json(runtimeHealthService.snapshot());
}));

adminRouter.get("/admin/users", asyncRoute(async (_req, res) => {
  res.json(authService.listManagedUsers());
}));

adminRouter.post("/admin/users", asyncRoute(async (req, res) => {
  const body = adminCreateUserSchema.parse(req.body);
  res.status(201).json(await authService.createManagedUser({ username: body.username, password: body.password }));
}));

adminRouter.delete("/admin/users/:userId", asyncRoute(async (req, res) => {
  const userId = z.coerce.number().int().positive().parse(req.params.userId);
  authService.deleteManagedUser(userId, req.user!.id);
  res.status(204).send();
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
  // Garder les '%:annual-financials' fundamentals (sous-clés derivées) — moins volatiles.
  db.prepare("DELETE FROM cache_entries WHERE scope = 'fundamentals' AND key NOT LIKE '%:annual-financials'").run();
  // Quotes / Dividendes / News / asset_article : purge complète des scopes correspondants.
  unifiedCacheRepository.deleteScopes(["quote", "dividends", "news", "asset_article"]);
  // Blocs frontend et agregats dependants des snapshots/dividendes/fundamentals.
  invalidateUserAssetCaches("*");

  const symbols = assetRepository.listTrackedSymbols();
  const job = dataConstructionQueue.enqueueAnnexRefresh(symbols);

  res.json(job);
}));
