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
