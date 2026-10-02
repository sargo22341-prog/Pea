import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Priorités de la file Yahoo (Bottleneck : 0 = la plus haute, 9 = la plus basse). Les cours et
 * données affichées passent avant les actualités, elles-mêmes avant les préchargements de fond.
 */
export const yahooCallPriority = {
  standard: 5,
  news: 7,
  background: 9
} as const;

export type YahooCallPriority = (typeof yahooCallPriority)[keyof typeof yahooCallPriority];

const priorityContext = new AsyncLocalStorage<YahooCallPriority>();

export function currentYahooCallPriority(): YahooCallPriority {
  return priorityContext.getStore() ?? yahooCallPriority.standard;
}

/**
 * Exécute `callback` en abaissant la priorité de ses appels Yahoo. Un contexte déjà plus bas est
 * conservé : une actualité rafraîchie par une tâche de fond reste une tâche de fond.
 */
export function runWithLowerYahooPriority<T>(priority: YahooCallPriority, callback: () => T): T {
  const current = currentYahooCallPriority();
  return priorityContext.run(priority > current ? priority : current, callback);
}
