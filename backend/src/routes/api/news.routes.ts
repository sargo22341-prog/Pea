import express from "express";
import { z } from "zod";
import { marketDataGateway } from "../../services/market/data/market-data-gateway.service.js";
import { assetNewsBatchSize, readAssetNewsPage } from "../../services/news/asset-news-feed.service.js";
import { asyncRoute } from "../shared/async-route.js";
import { userNewsLanguages } from "../shared/news.helpers.js";
import { requireAuthUser } from "../../middleware/auth.js";
import { symbolParam } from "../shared/symbol.js";

export const newsRouter = express.Router();

const pageQuery = z.coerce.number().int().optional().default(1);
const limitQuery = z.coerce.number().int().optional().default(assetNewsBatchSize);
const offsetQuery = z.coerce.number().int().optional().default(0);

newsRouter.get("/news-global", asyncRoute(async (req, res) => {
  if (!requireAuthUser(req).assetNewsEnabled) {
    res.json({ articles: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    return;
  }
  const page = Math.max(1, pageQuery.parse(req.query["page"]));
  res.json(await marketDataGateway.readGlobalNewsWithCache(page, userNewsLanguages(req)));
}));

newsRouter.get("/news-assets", asyncRoute(async (req, res) => {
  const user = requireAuthUser(req);
  const limit = Math.min(assetNewsBatchSize, Math.max(1, limitQuery.parse(req.query["limit"])));
  const offset = Math.max(0, offsetQuery.parse(req.query["offset"]));
  if (!user.assetNewsEnabled) {
    res.json({ articles: [], limit, offset, totalAssets: 0, queriedAssets: 0, hasMore: false });
    return;
  }
  res.json(await readAssetNewsPage(user.id, userNewsLanguages(req), limit, offset));
}));

newsRouter.get("/news/:symbol", asyncRoute(async (req, res) => {
  if (!requireAuthUser(req).assetNewsEnabled) {
    res.json([]);
    return;
  }
  const result = await marketDataGateway.readNewsWithCache(symbolParam(req.params["symbol"]), userNewsLanguages(req));
  res.json(result.data);
}));
