import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { authCookieName, authService, type AuthUser } from "../services/auth/auth.service.js";
import { HttpError } from "../utils/http-error.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
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

export function setAuthCookie(res: Response, token: string) {
  res.cookie(authCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.nodeEnv === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(authCookieName, { path: "/" });
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = authService.getUserBySession(readCookie(req, authCookieName));
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
