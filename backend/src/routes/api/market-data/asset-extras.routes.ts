import express from "express";
import { z } from "zod";
import { similarAssets } from "../../../services/assets/similar-assets.service.js";
import { fetchInsights } from "../../../services/yahoo/insights/insights.job.js";
import { fetchFinancialStatements } from "../../../services/yahoo/statements/statements.job.js";
import { asyncRoute } from "../../shared/async-route.js";

/**
 * Données complémentaires de la fiche actif, chargées à l'ouverture de l'onglet qui les affiche.
 * Chaque fonctionnalité répond 403 sans appeler Yahoo quand l'administrateur l'a coupée.
 */
export const assetExtrasRouter = express.Router();

const symbolSchema = z.object({ symbol: z.string().trim().min(1).max(32) });
const statementsQuerySchema = z.object({ period: z.enum(["annual", "quarterly"]).default("annual") });

assetExtrasRouter.get("/assets/:symbol/statements", asyncRoute(async (req, res) => {
  const { symbol } = symbolSchema.parse(req.params);
  const { period } = statementsQuerySchema.parse(req.query);
  res.json((await fetchFinancialStatements(symbol, period)).data);
}));

assetExtrasRouter.get("/assets/:symbol/insights", asyncRoute(async (req, res) => {
  const { symbol } = symbolSchema.parse(req.params);
  res.json((await fetchInsights(symbol)).data);
}));

assetExtrasRouter.get("/assets/:symbol/similar", asyncRoute(async (req, res) => {
  const { symbol } = symbolSchema.parse(req.params);
  res.json(await similarAssets(symbol));
}));
