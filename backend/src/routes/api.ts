/**
 * Role du fichier : assembler les categories de routes API et appliquer l'authentification.
 */

import express from "express";
import { attachUser, requireAdmin, requireAuth } from "../middleware/auth.js";
import { verifyMutatingRequestOrigin } from "../middleware/origin-protection.js";
import { runWithUser } from "../services/auth/user-context.js";
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
import { settingsRouter } from "./api/settings.routes.js";
import { topAndLosersRouter } from "./api/top-and-losers.routes.js";
import { watchlistRouter } from "./api/watchlist.routes.js";
import { calendarEventsRouter } from "./api/calendar-events.routes.js";

export const apiRouter = express.Router();

apiRouter.use(attachUser);
apiRouter.use(verifyMutatingRequestOrigin());

apiRouter.use("/auth", authRouter);

apiRouter.use(requireAuth);
apiRouter.use((req, _res, next) => runWithUser(req.user!.id, next));

apiRouter.use(searchRouter);
apiRouter.use(settingsRouter);
apiRouter.use(marketRouter);
apiRouter.use(newsRouter);
apiRouter.use(assetIconsRouter);
apiRouter.use(assetsRouter);
apiRouter.use(topAndLosersRouter);
apiRouter.use(portfolioRouter);
apiRouter.use(importRouter);
apiRouter.use(watchlistRouter);
apiRouter.use(calendarEventsRouter);
apiRouter.use(requireAdmin, adminRouter);

apiRouter.use((req) => {
  throw new HttpError(404, `Route API introuvable: ${req.method} ${req.path}`);
});
