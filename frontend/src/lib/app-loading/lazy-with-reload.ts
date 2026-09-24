import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "pea:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;
// Un echec de chargement est souvent passager (proxy, reveil du poste) : React garde
// en memoire la promesse rejetee d'un lazy, il faut donc reessayer avant de la rejeter.
export const CHUNK_RETRY_DELAYS_MS = [500, 1_500] as const;

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

function wait(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

async function importWithRetry<T>(factory: () => Promise<T>): Promise<T> {
  for (const delayMs of CHUNK_RETRY_DELAYS_MS) {
    try {
      return await factory();
    } catch (error) {
      console.warn("[app] chunk load failed, retrying", error);
      await wait(delayMs);
    }
  }
  return factory();
}

export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    importWithRetry(factory).catch((error: unknown) => {
      // Promesse jamais resolue pendant le rechargement : evite un flash d'erreur.
      if (reloadOnceForStaleChunk()) return new Promise<{ default: T }>(() => undefined);
      throw error;
    })
  );
}
