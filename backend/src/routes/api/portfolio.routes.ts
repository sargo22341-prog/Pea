/**
 * Role du fichier : declarer les routes de portefeuille, positions, performance et dividendes.
 */

import express from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { dividendService } from "../../services/portfolio/dividend.service.js";
import { portfolioAnalysisService } from "../../services/portfolio/portfolio-analysis.service.js";
import { portfolioService } from "../../services/portfolio/portfolio.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";

export const portfolioRouter = express.Router();

function dashboardIntradayDebugClock(range: string) {
  if (range !== "1d" || !config.debugDate) return undefined;
  return {
    forceIntradayOpen: true,
    intradayNow: config.debugDate
  };
}

portfolioRouter.get("/portfolio", asyncRoute(async (req, res) => {
  const range = req.query.range === undefined ? req.user!.defaultChartRange : parseRange(req.query.range);
  logger.debug("portfolio", "summary requested", { range, userId: req.user!.id });
  res.json(await portfolioService.summary(range));
}));

portfolioRouter.get("/portfolio/full", asyncRoute(async (req, res) => {
  const range = req.query.range === undefined ? req.user!.defaultChartRange : parseRange(req.query.range);
  logger.debug("portfolio", "full requested", { range, userId: req.user!.id });
  res.json(await portfolioService.full(range, req.user!.id, dashboardIntradayDebugClock(range)));
}));

portfolioRouter.get("/portfolio/analysis", asyncRoute(async (req, res) => {
  logger.debug("portfolio", "analysis requested", { userId: req.user!.id });
  res.json(await portfolioAnalysisService.analysis());
}));

portfolioRouter.post("/portfolio/positions", asyncRoute(async (req, res) => {
  const body = z
    .object({
      symbol: z.string(),
      name: z.string().optional(),
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR")
    })
    .parse(req.body);

  res.status(201).json(await portfolioService.createPosition(body));
}));

portfolioRouter.put("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const body = z
    .object({
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR"),
      notes: z.string().optional()
    })
    .parse(req.body);

  res.json(await portfolioService.updatePosition(id, body));
}));

portfolioRouter.get("/portfolio/positions/:id/transactions", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  res.json(portfolioService.listTransactions(id));
}));

portfolioRouter.post("/portfolio/positions/:id/transactions", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const body = z.object({
    tradedAt: z.string().min(1),
    type: z.enum(["buy", "sell"]),
    quantity: z.coerce.number().positive(),
    price: z.coerce.number().nonnegative(),
    totalFees: z.coerce.number().nonnegative().optional(),
    currency: z.string().min(3).max(8).default("EUR")
  }).parse(req.body);
  res.status(201).json(portfolioService.createTransaction(id, body));
}));

portfolioRouter.put("/portfolio/positions/:id/transactions/:transactionId", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const transactionId = z.coerce.number().int().positive().parse(req.params.transactionId);
  const body = z.object({
    tradedAt: z.string().min(1),
    type: z.enum(["buy", "sell"]),
    quantity: z.coerce.number().positive(),
    price: z.coerce.number().nonnegative(),
    totalFees: z.coerce.number().nonnegative().optional(),
    currency: z.string().min(3).max(8).default("EUR")
  }).parse(req.body);
  res.json(portfolioService.updateTransaction(id, transactionId, body));
}));

portfolioRouter.delete("/portfolio/positions/:id/transactions/:transactionId", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const transactionId = z.coerce.number().int().positive().parse(req.params.transactionId);
  portfolioService.deleteTransaction(id, transactionId);
  res.status(204).send();
}));

portfolioRouter.delete("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const deleted = portfolioService.deletePosition(id);
  if (!deleted) throw new HttpError(404, "Position introuvable");
  res.status(204).send();
}));

portfolioRouter.get("/portfolio/performance", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  logger.debug("portfolio", "performance requested", { range, userId: req.user!.id });
  res.json(await portfolioService.performance(range));
}));

portfolioRouter.get("/portfolio/chart", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  logger.debug("portfolio", "chart requested", { range, userId: req.user!.id });
  res.json(await portfolioService.chart(range, req.user!.id, dashboardIntradayDebugClock(range)));
}));

portfolioRouter.get("/portfolio/positions/performance", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  logger.debug("portfolio", "positions performance requested", { range, userId: req.user!.id });
  res.json(await portfolioService.positionsPerformance(range, dashboardIntradayDebugClock(range)));
}));

portfolioRouter.get("/portfolio/positions/:id/performance", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const range = parseRange(req.query.range);
  logger.debug("portfolio", "single position performance requested", { range, userId: req.user!.id, positionId: id });
  res.json(await portfolioService.singlePositionPerformance(id, range));
}));

portfolioRouter.get("/portfolio/dividends", asyncRoute(async (_req, res) => {
  res.json(await dividendService.portfolioDividends());
}));
