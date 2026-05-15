import type { RequestHandler } from "express";
import { config } from "../config.js";
import { logger } from "../services/shared/logger.service.js";
import { HttpError } from "../utils/http-error.js";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const devOrigins = new Set(["http://localhost", "https://localhost", "capacitor://localhost", "http://localhost:5173", "http://127.0.0.1:5173"]);

function requestOrigin(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== "null") return url.origin;
    if (url.protocol === "capacitor:" && url.host) return `${url.protocol}//${url.host}`;
    return undefined;
  } catch {
    return undefined;
  }
}

function allowedOrigins(req: Parameters<RequestHandler>[0]) {
  const host = req.headers.host;
  const origins = new Set<string>(config.nodeEnv === "production" ? [] : devOrigins);

  for (const origin of config.corsOrigins) {
    origins.add(origin);
  }

  if (config.publicUrl) origins.add(config.publicUrl);

  if (host && !config.publicUrl) {
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    origins.add(`${protocol}://${host}`);
  }

  return origins;
}

function isNativeBearerRequest(req: Parameters<RequestHandler>[0]) {
  return hasBearerAuthorization(req) || isNativeBearerAuthBootstrap(req);
}

function hasBearerAuthorization(req: Parameters<RequestHandler>[0]) {
  return req.header("Authorization")?.toLowerCase().startsWith("bearer ") === true;
}

function isNativeBearerAuthBootstrap(req: Parameters<RequestHandler>[0]) {
  if (req.header("X-PEA-Auth-Mode")?.toLowerCase() !== "bearer") return false;
  return req.method === "POST" && (req.path === "/auth/setup" || req.path === "/auth/login");
}

export function verifyMutatingRequestOrigin(): RequestHandler {
  return (req, _res, next) => {
    if (!mutatingMethods.has(req.method)) {
      next();
      return;
    }

    const origin = requestOrigin(req.headers.origin) ?? requestOrigin(req.headers.referer);

    // CapacitorHttp is a native client path and may not send Origin/Referer.
    // Bearer mode does not rely on browser cookies, so this is not the CSRF case
    // this middleware is meant to block.
    if (!origin && isNativeBearerRequest(req)) {
      next();
      return;
    }

    // In production, cookie-based mutating requests without Origin remain blocked.
    if (!origin && config.nodeEnv === "production") {
      next(new HttpError(403, "Origine de requete absente."));
      return;
    }

    if (origin && !allowedOrigins(req).has(origin)) {
      logger.warn("api", "mutating origin rejected", {
        method: req.method,
        path: req.path,
        origin,
        allowedOrigins: Array.from(allowedOrigins(req)),
        referer: req.headers.referer,
        host: req.headers.host
      });

      next(new HttpError(403, "Origine de requete non autorisee."));
      return;
    }
    next();
  };
}
