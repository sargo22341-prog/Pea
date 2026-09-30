import express from "express";
import { requireAdmin, requireAuthUser } from "../../middleware/auth.js";
import { createRateCounter } from "../../middleware/rate-limit.js";
import { maxIconBytes } from "../../services/assets/icon.helpers.js";
import { iconService } from "../../services/assets/icon.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { detectSupportedImageMime } from "../../utils/image-signature.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartIcon } from "../shared/multipart.js";
import { symbolParam } from "../shared/symbol.js";

export const assetIconsRouter = express.Router();

/**
 * Récupérations distantes d'icônes (Yahoo, logo.dev, favicon) par utilisateur et par minute :
 * une icône inconnue coûte des appels externes et une ligne en base, pas une icône en cache.
 */
const iconRemoteFetches = createRateCounter({ windowMs: 60_000, max: 30 });

function setIconCacheHeaders(res: express.Response, cacheControl = "private, max-age=3600") {
  res.setHeader("Cache-Control", cacheControl);
  res.removeHeader("Pragma");
  res.removeHeader("Expires");
  res.removeHeader("Surrogate-Control");
}

assetIconsRouter.get("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  const symbol = symbolParam(req.params["symbol"]);
  let icon = iconService.getIconFile(symbol);
  if (icon?.filePath && icon.mimeType) {
    setIconCacheHeaders(res);
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  if (iconService.needsRemoteFetch(symbol)) {
    if (!iconRemoteFetches.tryConsume(String(requireAuthUser(req).id))) {
      // Quota atteint : le placeholder n'est pas mis en cache pour que l'icône soit retentée.
      setIconCacheHeaders(res, "no-store");
      res.type("image/svg+xml").send(iconService.placeholder(symbol));
      return;
    }
    await iconService.fetchAndStoreIcon(symbol);
  }
  icon = iconService.getIconFile(symbol);
  if (icon?.filePath && icon.mimeType) {
    setIconCacheHeaders(res);
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  setIconCacheHeaders(res);
  res.type("image/svg+xml").send(iconService.placeholder(symbol));
}));

assetIconsRouter.post(
  "/assets/:symbol/icon",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const upload = await parseMultipartIcon(req);
    const symbol = symbolParam(req.params["symbol"]);
    if (!iconService.isAllowedImageMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (!detectSupportedImageMime(upload.buffer)) throw new HttpError(400, "Image invalide.");
    if (upload.buffer.length > maxIconBytes) throw new HttpError(400, "Image trop lourde, maximum 1MB.");
    logger.debug("icons", "icon upload", { symbol: symbol.toUpperCase(), mimeType: upload.mimeType, size: upload.buffer.length });
    res.json(iconService.saveIconFromBuffer(symbol, upload.buffer, "manual"));
  })
);

assetIconsRouter.delete("/assets/:symbol/icon", requireAdmin, asyncRoute((req, res) => {
  const symbol = symbolParam(req.params["symbol"]);
  iconService.resetIcon(symbol);
  logger.debug("icons", "icon delete", { symbol: symbol.toUpperCase() });
  res.status(204).send();
}));

assetIconsRouter.get("/asset-icons", asyncRoute((_req, res) => {
  res.json(iconService.listKnownAssets());
}));
