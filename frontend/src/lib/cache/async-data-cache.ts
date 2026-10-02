/** Nombre de réponses gardées en mémoire : une par page ou paramétrage récemment visité. */
const maxEntries = 50;

const entries = new Map<string, unknown>();

/**
 * Cache mémoire des dernières réponses affichées, partagé entre les visites d'une page pendant la
 * session : une page revisitée s'affiche immédiatement puis se rafraîchit en arrière-plan.
 * Chaque clé appartient à un seul appelant de `useAsync`, qui lui associe toujours le même type.
 */
export function readAsyncDataCache(key: string): unknown {
  return entries.get(key);
}

export function hasAsyncDataCache(key: string) {
  return entries.has(key);
}

export function writeAsyncDataCache(key: string, value: unknown) {
  // Réinsertion : l'entrée devient la plus récente pour l'éviction.
  entries.delete(key);
  entries.set(key, value);
  while (entries.size > maxEntries) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) return;
    entries.delete(oldestKey);
  }
}

/** Vide le cache (déconnexion, isolation des tests) : aucune donnée privée ne survit à la session. */
export function clearAsyncDataCache() {
  entries.clear();
}
