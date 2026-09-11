import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "pea:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;

// Un chunk Vite introuvable (nouveau deploiement, reseau coupe au reveil) laisse
// la page blanche : on recharge une fois pour recuperer un index.html a jour.
function reloadOnceForStaleChunk(): boolean {
  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error: unknown) => {
      // Promesse jamais resolue pendant le rechargement : evite un flash d'erreur.
      if (reloadOnceForStaleChunk()) return new Promise<{ default: T }>(() => undefined);
      throw error;
    })
  );
}
