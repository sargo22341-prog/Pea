/**
 * Role du fichier : exposer les top gainers et top losers Yahoo Finance via
 * une route backend authentifiee, sans fuite de yahoo-finance2 cote client.
 */

import express from "express";
import { fetchTopAndLosers } from "../../services/yahoo/screeners/top-movers.job.js";
import { asyncRoute } from "../shared/async-route.js";

export const topAndLosersRouter = express.Router();

/** GET /api/top-and-losers retourne les deux listes cachees pour la date locale serveur. */
topAndLosersRouter.get("/top-and-losers", asyncRoute(async (_req, res) => {
  res.json(await fetchTopAndLosers());
}));
