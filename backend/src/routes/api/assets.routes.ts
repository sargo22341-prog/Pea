import express from "express";
import { assetDetailsAssembler } from "../../services/assets/asset-details-assembler.service.js";
import { parseRange } from "../../utils/range.js";
import { asyncRoute } from "../shared/async-route.js";
import { routeParam } from "../shared/params.js";
import { userNewsLanguages } from "../shared/news.helpers.js";

export const assetsRouter = express.Router();

assetsRouter.get("/assets/:symbol", asyncRoute(async (req, res) => {
  const details = await assetDetailsAssembler.assemble({
    symbol: routeParam(req.params.symbol, "symbol"),
    range: parseRange(req.query.range),
    user: req.user!,
    newsLanguages: userNewsLanguages(req)
  });

  res.json(details);
}));
