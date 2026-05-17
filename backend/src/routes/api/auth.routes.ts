import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { createRateLimit } from "../../middleware/rate-limit.js";
import { requireAuth, clearAuthCookie, readSessionToken, setAuthCookie } from "../../middleware/auth.js";
import { authService } from "../../services/auth/auth.service.js";
import { authFailureTracker, clientIpFrom, sleep } from "../../services/auth/auth-failure-tracker.js";
import { logger } from "../../services/shared/logger.service.js";
import { HttpError } from "../../utils/http-error.js";
import { detectSupportedImageMime } from "../../utils/image-signature.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartIcon } from "../shared/multipart.js";

export const authRouter = express.Router();
const passwordSchema = z.string().min(10, "Le mot de passe doit contenir au moins 10 caracteres.");
const authSensitiveRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const passwordChangeRateLimit: RequestHandler = (req, res, next) => {
  if (typeof req.body === "object" && req.body !== null && "password" in req.body) {
    authSensitiveRateLimit(req, res, next);
    return;
  }
  next();
};

function wantsBearerSession(req: express.Request) {
  return req.header("X-PEA-Auth-Mode")?.toLowerCase() === "bearer";
}

function sendSessionResult(res: express.Response, req: express.Request, result: Awaited<ReturnType<typeof authService.login>>, status = 200) {
  if (wantsBearerSession(req)) {
    res.status(status).json({ user: result.user, token: result.token });
    return;
  }
  setAuthCookie(res, result.token);
  res.status(status).json(result.user);
}

authRouter.get("/me", asyncRoute(async (req, res) => {
  res.json({ user: req.user ?? null, setupRequired: !authService.hasUsers(), appTimezone: config.appTimezone });
}));

authRouter.post("/setup", authSensitiveRateLimit, asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(1),
    password: passwordSchema,
    confirmPassword: passwordSchema,
    profileIconUrl: z.string().url().optional().or(z.literal(""))
  }).parse(req.body);
  if (body.password !== body.confirmPassword) throw new HttpError(400, "Les mots de passe ne correspondent pas.");
  const result = await authService.setup(body.username, body.password, body.profileIconUrl || undefined);
  logger.info("auth", "setup success", { username: result.user.username, userId: result.user.id, ip: clientIpFrom(req) });
  sendSessionResult(res, req, result, 201);
}));

authRouter.post("/login", authSensitiveRateLimit, asyncRoute(async (req, res) => {
  const body = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  const ip = clientIpFrom(req);

  // Backoff exponentiel basé sur l'historique récent (par IP ou par username), même AVANT
  // d'appeler bcrypt — limite drastiquement le débit d'un attaquant.
  const backoffMs = authFailureTracker.delayForKeys([`ip:${ip}`, `user:${body.username.toLowerCase()}`]);
  if (backoffMs > 0) await sleep(backoffMs);

  let result: Awaited<ReturnType<typeof authService.login>>;
  try {
    result = await authService.login(body.username, body.password);
    authFailureTracker.recordSuccess({ ip, username: body.username });
    logger.info("auth", "login success", { username: result.user.username, userId: result.user.id, ip });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    authFailureTracker.recordFailure({ ip, username: body.username, reason });
    throw error;
  }
  sendSessionResult(res, req, result);
}));

authRouter.post("/logout", asyncRoute(async (req, res) => {
  authService.logout(readSessionToken(req));
  logger.debug("auth", "logout", { userId: req.user?.id, username: req.user?.username });
  clearAuthCookie(res);
  res.status(204).send();
}));

authRouter.patch("/me", requireAuth, passwordChangeRateLimit, asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(1).optional(),
    password: passwordSchema.optional(),
    confirmPassword: z.string().optional(),
    profileIconUrl: z.string().url().optional().or(z.literal("")).nullable(),
    dashboardDefaultSortKey: z.enum(["name", "currentMarketValue", "intervalPerformancePercent"]).optional(),
    dashboardDefaultSortDirection: z.enum(["asc", "desc"]).optional(),
    watchlistDefaultSortKey: z.enum(["name", "price", "performancePercent"]).optional(),
    watchlistDefaultSortDirection: z.enum(["asc", "desc"]).optional(),
    defaultChartRange: z.enum(["1d", "1w", "1m", "1y", "5y", "10y", "ytd", "all"]).optional(),
    localPeaSearchEnabled: z.boolean().optional(),
    assetNewsEnabled: z.boolean().optional(),
    newsLanguages: z.array(z.enum(["fr", "en"])).optional(),
    privacyModeEnabled: z.boolean().optional()
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
  if (body.password) {
    logger.info("auth", "password changed", { userId: updated.id, username: updated.username, ip: clientIpFrom(req) });
  }
  res.json(updated);
}));

authRouter.get("/me/profile-icon", requireAuth, asyncRoute(async (req, res) => {
  const icon = authService.getProfileIconFile(req.user!.id);
  if (!icon) {
    res.status(404).end();
    return;
  }
  res.type(icon.mimeType).sendFile(icon.filePath);
}));

authRouter.post(
  "/me/profile-icon",
  requireAuth,
  asyncRoute(async (req, res) => {
    const upload = await parseMultipartIcon(req);
    if (!authService.isAllowedProfileIconMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (!detectSupportedImageMime(upload.buffer)) throw new HttpError(400, "Image invalide.");
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
