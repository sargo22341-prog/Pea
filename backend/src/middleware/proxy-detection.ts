import type { RequestHandler } from "express";
import { logger } from "../services/shared/logger.service.js";

/**
 * Signale une seule fois qu'un reverse proxy transmet `X-Forwarded-For` alors que TRUST_PROXY
 * est désactivé : tous les clients partagent alors l'adresse du proxy, donc la même limite de
 * débit et le même frein anti-brute-force.
 */
export function warnOnUntrustedProxyHeaders(): RequestHandler {
  let warned = false;
  return (req, _res, next) => {
    if (!warned && req.headers["x-forwarded-for"] !== undefined) {
      warned = true;
      logger.warn("api", "X-Forwarded-For received while TRUST_PROXY=false: every client shares the proxy address for rate limiting. Set TRUST_PROXY=true behind a trusted reverse proxy.", {
        remoteAddress: req.socket.remoteAddress
      });
    }
    next();
  };
}
