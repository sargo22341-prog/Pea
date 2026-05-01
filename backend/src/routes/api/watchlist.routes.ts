/**
 * Role du fichier : declarer les routes de liste de suivi.
 */

import express from "express";
import { z } from "zod";
import { watchlistService } from "../../services/assets/watchlist.service.js";
import { HttpError } from "../../utils/http-error.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";

export const watchlistRouter = express.Router();

watchlistRouter.get("/watchlist", asyncRoute(async (req, res) => {
  res.json(await watchlistService.list(parseRange(req.query.range)));
}));

watchlistRouter.post("/watchlist/:symbol", asyncRoute(async (req, res) => {
  const body = z
    .object({
      name: z.string().optional(),
      exchange: z.string().optional(),
      currency: z.string().optional()
    })
    .partial()
    .parse(req.body ?? {});

  res.status(201).json(await watchlistService.add(routeParam(req.params.symbol, "symbol"), body));
}));

watchlistRouter.delete("/watchlist/:symbol", asyncRoute(async (req, res) => {
  const deleted = watchlistService.remove(routeParam(req.params.symbol, "symbol"));
  if (!deleted) throw new HttpError(404, "Actif absent de la liste de suivi");
  res.status(204).send();
}));
