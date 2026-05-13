import express from "express";
import type { MarketListId } from "@pea/shared";
import { fetchMarketList, fetchTopAndLosers } from "../../services/yahoo/screeners/top-movers.job.js";
import { asyncRoute } from "../shared/async-route.js";

export const topAndLosersRouter = express.Router();
const marketListIds = new Set<MarketListId>([
  "day_gainers",
  "day_losers",
  "trending_fr",
  "high_dividend_yield",
  "top_etfs_us",
  "undervalued_large_caps",
  "undervalued_growth_stocks"
]);

function isMarketListId(value: string): value is MarketListId {
  return marketListIds.has(value as MarketListId);
}

/** GET /api/top-and-losers retourne les deux listes cachees pour la date locale serveur. */
topAndLosersRouter.get("/top-and-losers", asyncRoute(async (_req, res) => {
  res.json(await fetchTopAndLosers());
}));

/** GET /api/market-lists/:id charge une seule liste Yahoo Finance a la demande. */
topAndLosersRouter.get("/market-lists/:id", asyncRoute(async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!isMarketListId(id)) {
    res.status(400).json({ message: "Liste Yahoo Finance inconnue." });
    return;
  }

  res.json(await fetchMarketList(id));
}));
