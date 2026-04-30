/**
 * Role du fichier : assembler les categories de routes API et appliquer l'authentification.
 */

import express from "express";
import { attachUser, requireAuth } from "../middleware/auth.js";
import { HttpError } from "../utils/http-error.js";
import { adminRouter } from "./api/admin.routes.js";
import { assetIconsRouter } from "./api/asset-icons.routes.js";
import { assetsRouter } from "./api/assets.routes.js";
import { authRouter } from "./api/auth.routes.js";
import { importRouter } from "./api/import.routes.js";
import { marketRouter } from "./api/market.routes.js";
import { newsRouter } from "./api/news.routes.js";
import { portfolioRouter } from "./api/portfolio.routes.js";
import { searchRouter } from "./api/search.routes.js";
import { watchlistRouter } from "./api/watchlist.routes.js";

export const apiRouter = express.Router();

apiRouter.use(attachUser);

apiRouter.use("/auth", authRouter);

apiRouter.use(requireAuth);

apiRouter.use(searchRouter);
apiRouter.use(marketRouter);
apiRouter.use(newsRouter);
apiRouter.use(assetIconsRouter);
apiRouter.use(assetsRouter);
apiRouter.use(portfolioRouter);
apiRouter.use(importRouter);
apiRouter.use(watchlistRouter);
apiRouter.use(adminRouter);

apiRouter.use((req) => {
  throw new HttpError(404, `Route API introuvable: ${req.method} ${req.path}`);
});
