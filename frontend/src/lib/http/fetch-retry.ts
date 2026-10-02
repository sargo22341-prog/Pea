/** Envoi HTTP borné par un délai, avec nouvelles tentatives des lectures sur erreur réseau ou de passerelle. */

/** Délai par défaut d'une requête API. */
export const defaultRequestTimeoutMs = 20_000;
// Erreurs de passerelle (proxy, redémarrage) seulement : une 503 signale un serveur saturé (file
// Yahoo pleine), la réessayer ajouterait de la charge au pire moment.
const retryableStatusCodes = new Set([502, 504]);
const retryDelaysMs = [350, 900];

export function abortError() {
  return new DOMException("Requete annulee", "AbortError");
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = defaultRequestTimeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => { controller.abort(new DOMException("Timeout reseau", "AbortError")); }, timeoutMs);
  const signal = init.signal;

  if (signal?.aborted) {
    window.clearTimeout(timeout);
    throw abortError();
  }

  const abort = () => { controller.abort(signal?.reason ?? abortError()); };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal) {
  const canRetry = isRetryableRequest(init);
  let lastError: unknown;

  // Chaque tentative porte le delai avant la suivante ; la derniere n'en a pas.
  for (const retryDelayMs of [...retryDelaysMs, undefined]) {
    if (externalSignal?.aborted) throw abortError();
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (!canRetry || !retryableStatusCodes.has(response.status) || retryDelayMs === undefined) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (!canRetry || externalSignal?.aborted || retryDelayMs === undefined) throw error;
    }
    await delay(retryDelayMs, externalSignal);
  }

  throw lastError instanceof Error ? lastError : new Error("Requete echouee apres retry.");
}

function isRetryableRequest(init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
}

function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(abortError());
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
