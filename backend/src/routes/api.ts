import express from "express";
import { attachUser, requireAdmin, requireAuth, requireAuthUser } from "../middleware/auth.js";
import { verifyMutatingRequestOrigin } from "../middleware/origin-protection.js";
import { runWithUser } from "../services/auth/user-context.js";
import { runWithYahooUsageSource } from "../services/yahoo/yahoo-usage-context.js";
import { HttpError } from "../utils/http-error.js";
import { adminRouter } from "./api/admin.routes.js";
import { assetIconsRouter } from "./api/asset-icons.routes.js";
import { assetsRouter } from "./api/assets.routes.js";
import { authRouter } from "./api/auth.routes.js";
import { importRouter } from "./api/import.routes.js";
import { marketRouter } from "./api/market.routes.js";
import { newsRouter } from "./api/news.routes.js";
import { objectivesRouter } from "./api/objectives.routes.js";
import { portfolioRouter } from "./api/portfolio.routes.js";
import { searchRouter } from "./api/search.routes.js";
import { watchlistRouter } from "./api/watchlist.routes.js";
import { calendarEventsRouter } from "./api/calendar/calendar-events.routes.js";
import { splitsRouter } from "./api/splits/splits.routes.js";
import { assetExtrasRouter } from "./api/market-data/asset-extras.routes.js";
import { marketsRouter } from "./api/market-data/markets.routes.js";
import { compareRouter } from "./api/market-data/compare.routes.js";
import { screenerRouter } from "./api/screener/screener.routes.js";
import { alertsRouter } from "./api/alerts/alerts.routes.js";
import { featureFlagsRouter } from "./api/admin/feature-flags.routes.js";

export const apiRouter = express.Router();

apiRouter.use(attachUser);
apiRouter.use(verifyMutatingRequestOrigin());

apiRouter.use("/auth", authRouter);

apiRouter.use(requireAuth);
apiRouter.use((req, _res, next) => { runWithUser(requireAuthUser(req).id, next); });
apiRouter.use((req, _res, next) => { runWithYahooUsageSource(`navigation utilisateur: ${req.method} ${req.path}`, next); });

apiRouter.use(searchRouter);
apiRouter.use(marketRouter);
apiRouter.use(newsRouter);
apiRouter.use(objectivesRouter);
apiRouter.use(assetIconsRouter);
apiRouter.use(assetExtrasRouter);
apiRouter.use(assetsRouter);
apiRouter.use(marketsRouter);
apiRouter.use(compareRouter);
apiRouter.use(screenerRouter);
apiRouter.use(alertsRouter);
apiRouter.use(portfolioRouter);
apiRouter.use(importRouter);
apiRouter.use(watchlistRouter);
apiRouter.use(calendarEventsRouter);
apiRouter.use(splitsRouter);
// Monté sous /admin : une URL inconnue hors de ce préfixe reste un 404 pour tout utilisateur.
apiRouter.use("/admin", requireAdmin, adminRouter, featureFlagsRouter);

apiRouter.use((req) => {
  throw new HttpError(404, `Route API introuvable: ${req.method} ${req.path}`);
});
