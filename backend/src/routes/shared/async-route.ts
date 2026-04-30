/**
 * Role du fichier : fournir le wrapper commun pour les handlers Express async.
 */

import type express from "express";

/**
 * Enveloppe un handler Express asynchrone et transmet les erreurs a Express.
 */
export const asyncRoute =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
