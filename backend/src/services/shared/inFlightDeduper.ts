import { logger } from "./logger.service.js";

const inFlight = new Map<string, Promise<unknown>>();

function logDebug(message: string, key: string) {
  logger.debug("cache", `dedupe ${message.toLowerCase()}`, { key });
}

/**
 * Déduplique les appels concurrents par clé.
 *
 * En cas d'erreur, la promesse est immédiatement retirée du registre afin qu'un nouvel appelant
 * (postérieur à l'échec) puisse retenter indépendamment plutôt que d'hériter automatiquement de
 * la même erreur — ce qui transformait un 429 transitoire en panne globale propagée à tous les
 * clients en attente.
 *
 * Note : les appelants déjà attachés à la promesse au moment de l'échec recevront forcément
 * l'erreur (c'est la même promise partagée), mais aucun nouvel appel n'attendra la promesse
 * rejetée — la fenêtre de propagation est ainsi minimisée à la durée du fetch initial.
 */
export async function dedupeInFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    logDebug("WAIT", key);
    return existing as Promise<T>;
  }

  logDebug("START", key);
  const promise = Promise.resolve()
    .then(fn)
    .then(
      (result) => {
        logDebug("DONE", key);
        // Libère l'entrée APRÈS succès uniquement, pour que les requêtes concurrentes profitent
        // toutes du même résultat. Le delete est synchrone : tout nouvel appelant repart à zéro.
        if (inFlight.get(key) === promise) inFlight.delete(key);
        return result;
      },
      (error) => {
        logDebug("ERROR", key);
        // Libère IMMÉDIATEMENT en cas d'erreur — un nouvel appelant doit pouvoir retenter sans
        // hériter du dernier échec.
        if (inFlight.get(key) === promise) inFlight.delete(key);
        throw error;
      }
    );

  inFlight.set(key, promise);
  return promise;
}

/**
 * Réinitialise le registre (utilisé par les tests). Ne pas appeler en production.
 */
export function clearInFlightForTesting() {
  inFlight.clear();
}
