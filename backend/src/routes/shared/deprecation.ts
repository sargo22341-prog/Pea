import type { RequestHandler } from "express";
import { logger } from "../../services/shared/logger.service.js";

/**
 * Middleware qui marque une route comme obsolète :
 *   - Header HTTP `Deprecation: true`
 *   - Header `Sunset` indicatif (date à laquelle on prévoit le retrait)
 *   - Header `Link` pointant vers la route de remplacement (rel="successor-version")
 *   - Log WARN avec User-Agent et IP pour identifier les callers résiduels avant le retrait
 *
 * Empêche tout retrait silencieux : si quelqu'un dépend encore d'une route compat, ça
 * apparaîtra dans les logs WARN.
 */
export function deprecated(input: { sunsetDate: string; replacement: string; reason?: string }): RequestHandler {
  return (req, res, next) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", input.sunsetDate);
    res.setHeader("Link", `<${input.replacement}>; rel="successor-version"`);
    logger.warn("api", "deprecated route hit", {
      method: req.method,
      path: req.path,
      replacement: input.replacement,
      sunsetDate: input.sunsetDate,
      reason: input.reason,
      userAgent: req.headers["user-agent"] ?? "unknown",
      ip: req.ip ?? "unknown",
      userId: req.user?.id
    });
    next();
  };
}
