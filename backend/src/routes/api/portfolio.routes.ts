import express from "express";
import { z } from "zod";
import { dividendService } from "../../services/portfolio/dividends/dividend.service.js";
import { portfolioAnalysisService } from "../../services/portfolio/analysis/portfolio-analysis.service.js";
import { portfolioService } from "../../services/portfolio/portfolio.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { intradayDebugClock } from "../../utils/debug-clock.js";
import { HttpError } from "../../utils/http-error.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";
import { yahooSymbolSchema } from "../shared/symbol.js";
import { requireAuthUser } from "../../middleware/auth.js";

export const portfolioRouter = express.Router();

const tradedAtSchema = z.string().trim().min(1).transform((value, context) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    context.addIssue({ code: "custom", message: "Date de transaction invalide." });
    return z.NEVER;
  }
  return date.toISOString();
});

portfolioRouter.get("/portfolio/full", asyncRoute(async (req, res) => {
  const range = req.query["range"] === undefined ? requireAuthUser(req).defaultChartRange : parseRange(req.query["range"]);
  logger.debug("portfolio", "full requested", { range, userId: requireAuthUser(req).id });
  res.json(await portfolioService.full(range, requireAuthUser(req).id, intradayDebugClock(range)));
}));

portfolioRouter.get("/portfolio/analysis", asyncRoute(async (req, res) => {
  logger.debug("portfolio", "analysis requested", { userId: requireAuthUser(req).id });
  res.json(await portfolioAnalysisService.analysis());
}));

portfolioRouter.post("/portfolio/positions/ensure", asyncRoute((req, res) => {
  const body = z
    .object({
      symbol: yahooSymbolSchema,
      name: z.string().trim().optional(),
      currency: z.string().default("EUR")
    })
    .parse(req.body);

  const position = portfolioService.ensurePosition(body.symbol, body.name ?? body.symbol, body.currency);
  res.status(201).json({
    ...position,
    currentPrice: 0,
    marketValue: 0,
    costBasis: 0,
    performance: 0,
    performancePercent: 0
  });
}));

portfolioRouter.get("/portfolio/positions/:id/transactions", asyncRoute((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  res.json(portfolioService.listTransactions(id));
}));

portfolioRouter.post("/portfolio/positions/:id/transactions", asyncRoute((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  const body = z.object({
    tradedAt: tradedAtSchema,
    type: z.enum(["buy", "sell"]),
    quantity: z.coerce.number().positive(),
    price: z.coerce.number().nonnegative(),
    totalFees: z.coerce.number().nonnegative().optional(),
    currency: z.string().min(3).max(8).default("EUR")
  }).parse(req.body);
  res.status(201).json(portfolioService.createTransaction(id, body));
}));

portfolioRouter.put("/portfolio/positions/:id/transactions/:transactionId", asyncRoute((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  const transactionId = z.coerce.number().int().positive().parse(req.params["transactionId"]);
  const body = z.object({
    tradedAt: tradedAtSchema,
    type: z.enum(["buy", "sell"]),
    quantity: z.coerce.number().positive(),
    price: z.coerce.number().nonnegative(),
    totalFees: z.coerce.number().nonnegative().optional(),
    currency: z.string().min(3).max(8).default("EUR")
  }).parse(req.body);
  res.json(portfolioService.updateTransaction(id, transactionId, body));
}));

portfolioRouter.delete("/portfolio/positions/:id/transactions/:transactionId", asyncRoute((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  const transactionId = z.coerce.number().int().positive().parse(req.params["transactionId"]);
  portfolioService.deleteTransaction(id, transactionId);
  res.status(204).send();
}));

portfolioRouter.delete("/portfolio/positions/:id", asyncRoute((req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  const deleted = portfolioService.deletePosition(id);
  if (!deleted) throw new HttpError(404, "Position introuvable");
  res.status(204).send();
}));

portfolioRouter.get("/portfolio/positions/performance", asyncRoute(async (req, res) => {
  const range = parseRange(req.query["range"]);
  logger.debug("portfolio", "positions performance requested", { range, userId: requireAuthUser(req).id });
  res.json(await portfolioService.positionsPerformance(range, intradayDebugClock(range)));
}));

portfolioRouter.get("/portfolio/positions/:id/performance", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params["id"]);
  const range = parseRange(req.query["range"]);
  logger.debug("portfolio", "single position performance requested", { range, userId: requireAuthUser(req).id, positionId: id });
  res.json(await portfolioService.singlePositionPerformance(id, range));
}));

portfolioRouter.get("/portfolio/dividends", asyncRoute(async (_req, res) => {
  res.json(await dividendService.portfolioDividends());
}));
