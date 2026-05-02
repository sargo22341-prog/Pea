import type { RequestHandler } from "express";
import { config } from "../config.js";
import { HttpError } from "../utils/http-error.js";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const devOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

function requestOrigin(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function allowedOrigins(req: Parameters<RequestHandler>[0]) {
  const host = req.headers.host;
  const origins = new Set<string>(config.nodeEnv === "production" ? [] : devOrigins);
  if (host) {
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    origins.add(`${protocol}://${host}`);
  }
  return origins;
}

export function verifyMutatingRequestOrigin(): RequestHandler {
  return (req, _res, next) => {
    if (!mutatingMethods.has(req.method)) {
      next();
      return;
    }

    const origin = requestOrigin(req.headers.origin) ?? requestOrigin(req.headers.referer);
    if (!origin || allowedOrigins(req).has(origin)) {
      next();
      return;
    }

    next(new HttpError(403, "Origine de requete non autorisee."));
  };
}
