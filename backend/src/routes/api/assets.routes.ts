import express from "express";
import { assetDetailsAssembler } from "../../services/assets/asset-details-assembler.service.js";
import { parseRange } from "../../utils/range.js";
import { parseChartOverlays } from "../../services/market/charts/chart-overlays.service.js";
import { asyncRoute } from "../shared/async-route.js";
import { symbolParam } from "../shared/symbol.js";
import { userNewsLanguages } from "../shared/news.helpers.js";
import { requireAuthUser } from "../../middleware/auth.js";

export const assetsRouter = express.Router();

assetsRouter.get("/assets/:symbol", asyncRoute(async (req, res) => {
  const details = await assetDetailsAssembler.assemble({
    symbol: symbolParam(req.params["symbol"]),
    range: parseRange(req.query["range"]),
    overlays: parseChartOverlays(req.query["overlays"]),
    user: requireAuthUser(req),
    newsLanguages: userNewsLanguages(req)
  });

  res.json(details);
}));
