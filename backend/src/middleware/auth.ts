import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { authCookieName, authService, type AuthUser } from "../services/auth/auth.service.js";
import { hashToken } from "../services/auth/auth-user.mapper.js";
import { HttpError } from "../utils/http-error.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser | undefined;
  }
}

/** Utilisateur d'une route protegee par requireAuth ; leve une 401 si la requete n'est pas authentifiee. */
export function requireAuthUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Authentification requise.");
  return req.user;
}

export function readCookie(req: Request, name: string) {
  const cookie = req.headers.cookie;
  if (!cookie) return undefined;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function readBearerToken(req: Request) {
  const authorization = req.headers.authorization;
  if (!authorization) return undefined;
  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  if (extra || scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

export function readSessionToken(req: Request) {
  return readBearerToken(req) ?? readCookie(req, authCookieName);
}

/** Empreinte de la session de la requête, identique à celle stockée en base (jamais le jeton brut). */
export function sessionKeyOf(token: string) {
  return hashToken(token);
}

/** Empreinte de la session d'une route protégée par requireAuth. */
export function requireSessionKey(req: Request) {
  const token = readSessionToken(req);
  if (!token) throw new HttpError(401, "Authentification requise.");
  return sessionKeyOf(token);
}

function shouldUseSecureCookie() {
  return config.nodeEnv === "production" && config.publicUrl?.startsWith("https://") === true;
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(authCookieName, token, {
    httpOnly: true,
    // "strict" empêche l'envoi du cookie sur toute navigation cross-site,
    // y compris les GET top-level. Sans impact pour une SPA servie sur le même domaine.
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(authCookieName, { path: "/" });
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = authService.getUserBySession(readSessionToken(req));
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!authService.hasUsers()) {
    next(new HttpError(428, "Configuration du premier compte requise."));
    return;
  }
  if (!req.user) {
    next(new HttpError(401, "Authentification requise."));
    return;
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new HttpError(401, "Authentification requise."));
    return;
  }
  if (req.user.role !== "admin") {
    next(new HttpError(403, "Droits administrateur requis."));
    return;
  }
  next();
}
