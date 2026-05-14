export const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

const inFlightRequests = new Map<string, Promise<unknown>>();
const maxInFlightRequests = 500;

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly raw?: unknown;

  constructor(status: number, message: string, options: { details?: unknown; raw?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options.details;
    this.raw = options.raw;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

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
    if (inFlightRequests.size >= maxInFlightRequests) {
      return Promise.reject(new Error("Trop de requetes en cours."));
    }
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
    const rawText = await response.text().catch(() => "");
    let body: unknown;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = rawText;
    }
    const payload = body && typeof body === "object" ? body as { message?: unknown; details?: unknown } : {};
    const message = typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : `Erreur API ${response.status}`;
    throw new ApiError(response.status, message, { details: payload.details, raw: body });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
