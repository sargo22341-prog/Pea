/**
 * Role du fichier : regrouper les petits helpers de logs et de mesure de duree
 * utilises par les jobs Yahoo.
 */

import { logger } from "../../shared/logger.service.js";

/** Arrondit une duree issue de performance.now() pour les logs. */
export function roundMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

/** Extrait le symbole d'une cle de job comme "quote:AI.PA". */
export function symbolFromKey(key: string) {
  const [, symbol] = key.split(":");
  return symbol ? symbol.toUpperCase() : "n/a";
}

/** Log standardise pour les fetchs et caches de market-data. */
export function logMarketData(message: string, details: Record<string, string | number | boolean | undefined>) {
  logger.debug("market-data", message, details);
}
