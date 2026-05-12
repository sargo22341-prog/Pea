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
  if (config.publicUrl) origins.add(config.publicUrl);
  if (host && !config.publicUrl) {
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

    // En production, toute requête mutante sans header Origin est bloquée :
    // les navigateurs modernes envoient toujours Origin sur les requêtes cross-site,
    // et une SPA same-origin l'envoie aussi. L'absence d'Origin est suspecte.
    if (!origin && config.nodeEnv === "production") {
      next(new HttpError(403, "Origine de requete absente."));
      return;
    }

    if (origin && !allowedOrigins(req).has(origin)) {
      next(new HttpError(403, "Origine de requete non autorisee."));
      return;
    }

    next();
  };
}
