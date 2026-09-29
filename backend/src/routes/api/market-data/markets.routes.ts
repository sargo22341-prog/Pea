import express from "express";
import { z } from "zod";
import { MARKET_LIST_IDS } from "@pea/shared";
import { marketList } from "../../../services/assets/market-lists.service.js";
import { marketOverview } from "../../../services/market/overview/market-overview.service.js";
import { asyncRoute } from "../../shared/async-route.js";

/** Page Marchés : vue d'ensemble (indices, devises, matières premières, taux) et listes Yahoo. */
export const marketsRouter = express.Router();

const listParamsSchema = z.object({ id: z.enum(MARKET_LIST_IDS) });
const listQuerySchema = z.object({ peaOnly: z.enum(["true", "false"]).default("false").transform((value) => value === "true") });

marketsRouter.get("/markets/overview", asyncRoute(async (_req, res) => {
  res.json(await marketOverview());
}));

/** GET /api/market-lists/:id?peaOnly=true charge une seule liste Yahoo Finance à la demande. */
marketsRouter.get("/market-lists/:id", asyncRoute(async (req, res) => {
  const { id } = listParamsSchema.parse(req.params);
  const { peaOnly } = listQuerySchema.parse(req.query);
  res.json(await marketList(id, peaOnly));
}));
