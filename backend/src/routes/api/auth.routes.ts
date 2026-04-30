/**
 * Role du fichier : declarer les routes d'authentification et de profil utilisateur.
 */

import express from "express";
import { z } from "zod";
import { requireAuth, clearAuthCookie, readCookie, setAuthCookie } from "../../middleware/auth.js";
import { authCookieName, authService } from "../../services/auth/auth.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartIcon } from "../shared/multipart.js";

export const authRouter = express.Router();

authRouter.get("/me", asyncRoute(async (req, res) => {
  res.json({ user: req.user ?? null, setupRequired: !authService.hasUsers() });
}));

authRouter.post("/setup", asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
    confirmPassword: z.string().min(1),
    profileIconUrl: z.string().url().optional().or(z.literal(""))
  }).parse(req.body);
  if (body.password !== body.confirmPassword) throw new HttpError(400, "Les mots de passe ne correspondent pas.");
  const result = await authService.setup(body.username, body.password, body.profileIconUrl || undefined);
  logger.debug("auth", "setup success", { username: result.user.username, userId: result.user.id });
  setAuthCookie(res, result.token);
  res.status(201).json(result.user);
}));

authRouter.post("/login", asyncRoute(async (req, res) => {
  const body = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  let result: Awaited<ReturnType<typeof authService.login>>;
  try {
    result = await authService.login(body.username, body.password);
    logger.debug("auth", "login success", { username: result.user.username, userId: result.user.id });
  } catch (error) {
    logger.debug("auth", "login fail", { username: body.username, error: error instanceof Error ? error.message : "unknown error" });
    throw error;
  }
  setAuthCookie(res, result.token);
  res.json(result.user);
}));

authRouter.post("/logout", asyncRoute(async (req, res) => {
  authService.logout(readCookie(req, authCookieName));
  logger.debug("auth", "logout", { userId: req.user?.id, username: req.user?.username });
  clearAuthCookie(res);
  res.status(204).send();
}));

authRouter.patch("/me", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    confirmPassword: z.string().optional(),
    profileIconUrl: z.string().url().optional().or(z.literal("")).nullable(),
    dashboardDefaultSortKey: z.enum(["name", "currentMarketValue", "intervalPerformancePercent"]).optional(),
    dashboardDefaultSortDirection: z.enum(["asc", "desc"]).optional(),
    defaultChartRange: z.enum(["1d", "1w", "1m", "1y", "5y", "10y", "ytd", "all", "max"]).optional(),
    localPeaSearchEnabled: z.boolean().optional(),
    assetNewsEnabled: z.boolean().optional(),
    newsLanguages: z.array(z.enum(["fr", "en"])).optional()
  }).parse(req.body);
  if (body.password && body.password !== body.confirmPassword) throw new HttpError(400, "Les mots de passe ne correspondent pas.");
  const updated = await authService.updateUser(req.user!.id, body);
  logger.debug("auth", "user updated", {
    userId: updated.id,
    username: updated.username,
    passwordChanged: Boolean(body.password),
    localPeaSearchEnabled: updated.localPeaSearchEnabled,
    assetNewsEnabled: updated.assetNewsEnabled,
    newsLanguages: updated.newsLanguages.join(",")
  });
  res.json(updated);
}));

authRouter.get("/me/profile-icon", requireAuth, asyncRoute(async (req, res) => {
  const icon = authService.getProfileIconFile(req.user!.id);
  if (!icon) {
    res.status(404).json({ message: "Icone de profil absente." });
    return;
  }
  res.type(icon.mimeType).sendFile(icon.filePath);
}));

authRouter.post(
  "/me/profile-icon",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "1100kb" }),
  asyncRoute(async (req, res) => {
    const upload = parseMultipartIcon(req);
    if (!authService.isAllowedProfileIconMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (upload.buffer.length > 1024 * 1024) throw new HttpError(400, "Image trop lourde, maximum 1MB.");
    logger.debug("auth", "profile icon upload", { userId: req.user!.id, mimeType: upload.mimeType, size: upload.buffer.length });
    res.json(authService.saveProfileIcon(req.user!.id, upload.buffer, upload.mimeType));
  })
);

authRouter.delete("/me/profile-icon", requireAuth, asyncRoute(async (req, res) => {
  authService.deleteProfileIcon(req.user!.id);
  logger.debug("auth", "profile icon delete", { userId: req.user!.id });
  res.status(204).send();
}));
