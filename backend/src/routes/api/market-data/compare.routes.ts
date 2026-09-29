import express from "express";
import { z } from "zod";
import { COMPARE_MAX_SYMBOLS, COMPARE_MIN_SYMBOLS } from "@pea/shared";
import { compareAssets } from "../../../services/compare/compare.service.js";
import { asyncRoute } from "../../shared/async-route.js";
import { YAHOO_SYMBOL_PATTERN } from "../../shared/symbol.js";

const compareQuerySchema = z.object({
  symbols: z.string()
    .transform((value) => [...new Set(value.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))])
    .pipe(z.array(z.string().regex(YAHOO_SYMBOL_PATTERN)).min(COMPARE_MIN_SYMBOLS).max(COMPARE_MAX_SYMBOLS))
});

/** Comparateur : `GET /api/compare?symbols=A,B,C` (2 à 4 actifs, doublons ignorés). */
export const compareRouter = express.Router();

compareRouter.get("/compare", asyncRoute(async (req, res) => {
  const { symbols } = compareQuerySchema.parse(req.query);
  res.json(await compareAssets(symbols));
}));
