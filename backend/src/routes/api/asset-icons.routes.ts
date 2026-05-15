import express from "express";
import { iconService } from "../../services/assets/icon.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { detectSupportedImageMime } from "../../utils/image-signature.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartIcon } from "../shared/multipart.js";
import { routeParam } from "../shared/params.js";

export const assetIconsRouter = express.Router();

function setIconCacheHeaders(res: express.Response) {
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.removeHeader("Pragma");
  res.removeHeader("Expires");
  res.removeHeader("Surrogate-Control");
}

assetIconsRouter.get("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  const symbol = routeParam(req.params.symbol, "symbol");
  let icon = iconService.getIconFile(symbol);
  if (icon?.filePath && icon.mimeType) {
    setIconCacheHeaders(res);
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  await iconService.fetchAndStoreIcon(symbol);
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
  asyncRoute(async (req, res) => {
    const upload = await parseMultipartIcon(req);
    const symbol = routeParam(req.params.symbol, "symbol");
    if (!iconService.isAllowedImageMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (!detectSupportedImageMime(upload.buffer)) throw new HttpError(400, "Image invalide.");
    if (upload.buffer.length > 1024 * 1024) throw new HttpError(400, "Image trop lourde, maximum 1MB.");
    logger.debug("icons", "icon upload", { symbol: symbol.toUpperCase(), mimeType: upload.mimeType, size: upload.buffer.length });
    res.json(await iconService.saveIconFromBuffer(symbol, upload.buffer, upload.mimeType, "manual"));
  })
);

assetIconsRouter.delete("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  const symbol = routeParam(req.params.symbol, "symbol");
  iconService.resetIcon(symbol);
  logger.debug("icons", "icon delete", { symbol: symbol.toUpperCase() });
  res.status(204).send();
}));

assetIconsRouter.get("/asset-icons", asyncRoute(async (_req, res) => {
  res.json(iconService.listKnownAssets());
}));
