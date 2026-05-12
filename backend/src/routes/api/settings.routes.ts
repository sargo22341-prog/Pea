/**
 * Role du fichier : exposer les reglages et diagnostics lisibles depuis la page Parametres.
 */

import express from "express";
import { z } from "zod";
import { yahooUsageService } from "../../services/yahoo/yahoo-usage.service.js";
import { asyncRoute } from "../shared/async-route.js";

export const settingsRouter = express.Router();

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

settingsRouter.get("/settings/yahoo-usage/stats", asyncRoute(async (req, res) => {
  const query = yahooUsageQuerySchema.parse(req.query);
  res.json(yahooUsageService.stats(query));
}));

settingsRouter.get("/settings/yahoo-usage/calls", asyncRoute(async (req, res) => {
  const query = yahooUsageQuerySchema.parse(req.query);
  res.json(yahooUsageService.list(query));
}));
