export const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

const inFlightRequests = new Map<string, Promise<unknown>>();

function abortError() {
  return new DOMException("Requete annulee", "AbortError");
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener("abort", () => reject(abortError()), { once: true });
    })
  ]);
}

/**
 * Déduplique les requêtes concurrentes vers le même endpoint+paramètres.
 *
 * IMPORTANT : la clé de déduplication est `path` *avec* sa query string. Tous les callers
 * (`portfolio-api.ts`, `market-api.ts`) construisent déjà le path complet
 * (ex: `/api/portfolio?range=1d`). Si on s'attend à dédupliquer deux paramétrisations
 * différentes du même endpoint, elles auront naturellement deux clés distinctes.
 *
 * Le `signal` ne propage pas l'abort à la promesse partagée — un caller qui abort ne tue pas
 * le fetch ni les autres callers en attente. C'est volontaire : il s'agit d'éviter le wasted
 * fetch, pas de coordonner des cancellations.
 */
export function dedupedRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  let existing = inFlightRequests.get(path) as Promise<T> | undefined;
  if (!existing) {
    existing = request<T>(path).finally(() => {
      inFlightRequests.delete(path);
    });
    inFlightRequests.set(path, existing);
  }

  return withAbort(existing, signal);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers };
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    credentials: "include",
    ...init
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Erreur API ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
