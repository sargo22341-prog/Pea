import { AsyncLocalStorage } from "node:async_hooks";

const userContext = new AsyncLocalStorage<number>();

export function runWithUser<T>(userId: number, callback: () => T): T {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error(`runWithUser: identifiant utilisateur invalide (${userId})`);
  }
  return userContext.run(Math.floor(userId), callback);
}

/**
 * Retourne l'identifiant utilisateur courant ou lève si aucun contexte n'est actif.
 *
 * Comportement durci : auparavant la fonction retombait silencieusement sur user_id=1, ce qui
 * permettait à n'importe quelle exécution hors `runWithUser` (job, script CLI, oubli de
 * middleware) de lire/écrire les positions de l'admin. On exige désormais un contexte explicite.
 */
export function currentUserId(): number {
  const userId = userContext.getStore();
  if (userId === undefined) {
    throw new Error(
      "currentUserId(): aucun contexte utilisateur actif. " +
      "Tout appel doit être enveloppé par runWithUser(req.user.id) ou recevoir un userId explicite."
    );
  }
  return userId;
}

/**
 * Variante non-throw : retourne `undefined` si aucun contexte. À utiliser uniquement pour les
 * opérations qui peuvent légitimement tourner hors HTTP (logging multi-user, télémétrie,
 * fallback de cache global).
 */
export function optionalCurrentUserId(): number | undefined {
  return userContext.getStore();
}

/**
 * Résout l'identifiant utilisateur à utiliser : valeur explicite si fournie, sinon contexte ALS.
 * Lève si aucun des deux n'est disponible.
 */
export function requireUserId(userId?: number | string): number {
  if (userId !== undefined && userId !== null && userId !== "") {
    const numeric = Number(userId);
    if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
    throw new Error(`requireUserId(): identifiant utilisateur invalide (${userId})`);
  }
  return currentUserId();
}
