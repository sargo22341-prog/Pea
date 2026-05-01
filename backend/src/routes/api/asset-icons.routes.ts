/**
 * Role du fichier : declarer les routes de lecture et de gestion des icones d'actifs.
 */

import express from "express";
import { iconService } from "../../services/assets/icon.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartIcon } from "../shared/multipart.js";

export const assetIconsRouter = express.Router();

assetIconsRouter.get("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  let icon = iconService.getIconFile(req.params.symbol);
  if (icon?.filePath && icon.mimeType) {
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  await iconService.fetchAndStoreIcon(req.params.symbol);
  icon = iconService.getIconFile(req.params.symbol);
  if (icon?.filePath && icon.mimeType) {
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  res.type("image/svg+xml").send(iconService.placeholder(req.params.symbol));
}));

assetIconsRouter.post(
  "/assets/:symbol/icon",
  asyncRoute(async (req, res) => {
    const upload = await parseMultipartIcon(req);
    if (!iconService.isAllowedImageMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (upload.buffer.length > 1024 * 1024) throw new HttpError(400, "Image trop lourde, maximum 1MB.");
    logger.debug("icons", "icon upload", { symbol: req.params.symbol.toUpperCase(), mimeType: upload.mimeType, size: upload.buffer.length });
    res.json(await iconService.saveIconFromBuffer(req.params.symbol, upload.buffer, upload.mimeType, "manual"));
  })
);

assetIconsRouter.delete("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  iconService.resetIcon(req.params.symbol);
  logger.debug("icons", "icon delete", { symbol: req.params.symbol.toUpperCase() });
  res.status(204).send();
}));

assetIconsRouter.get("/asset-icons", asyncRoute(async (_req, res) => {
  res.json(iconService.listKnownAssets());
}));
