/**
 * Lock par scope (typiquement `${operation}:${symbol}`) pour sérialiser les opérations qui
 * écrivent dans les mêmes tables candles ou snapshots.
 *
 * Le lock est uniquement intra-process : il protège des races entre `refreshCandlesForAsset`
 * et `refreshLiveIntradayForAsset` (deux callers concurrents qui font UPSERT sur
 * `chart_candles_1d`). Pour la coordination multi-process, on s'appuie déjà sur
 * `scheduler-lock.repository.ts`.
 *
 * Sémantique : les appels en attente sont mis en file et exécutés séquentiellement par scope.
 * Une erreur dans `fn` n'empêche pas les callers suivants de s'exécuter — seul le pending qui
 * a levé reçoit l'erreur.
 */
class SymbolLockService {
  private locks = new Map<string, Promise<unknown>>();

  async withLock<T>(scope: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(scope) ?? Promise.resolve();
    let release!: () => void;
    const ticket = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Notre maillon de chaîne : se chaîne sur la promesse précédente sans propager d'erreur.
    const chained = previous.then(() => undefined, () => undefined).then(() => ticket);
    this.locks.set(scope, chained);

    try {
      // Attend que tous les locks précédents se libèrent (succès ou erreur).
      await previous.then(() => undefined, () => undefined);
      return await fn();
    } finally {
      release();
      // Si on est toujours le dernier maillon, on libère la map pour éviter les fuites mémoire.
      if (this.locks.get(scope) === chained) this.locks.delete(scope);
    }
  }

  /** Indique s'il existe une opération en cours pour ce scope. */
  isLocked(scope: string): boolean {
    return this.locks.has(scope);
  }

  /** Réinitialise tous les locks (test only). */
  resetForTesting() {
    this.locks.clear();
  }
}

export const symbolLockService = new SymbolLockService();
