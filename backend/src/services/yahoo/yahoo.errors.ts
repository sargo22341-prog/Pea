import { HttpError } from "../../utils/http-error.js";

/** Retourne un message lisible, meme si Yahoo renvoie autre chose qu'une Error. */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || !error) return undefined;
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  return candidate.status ?? candidate.statusCode ?? candidate.code;
}

/** Requête abandonnée par `AbortSignal.timeout` (voir `yahooRequestTimeoutMs`). */
function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || errorMessage(error.cause).includes("aborted due to timeout"));
}

/** Identifie les erreurs Yahoo temporaires pour lesquelles un retry ou un cache stale est acceptable. */
export function isTemporaryYahooError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code = errorCode(error);

  return (
    isTimeoutError(error) ||
    code === 429 ||
    code === 401 ||
    message.includes("too many requests") ||
    message.includes("edge: too many requests") ||
    message.includes("invalid crumb") ||
    message.includes("user is not logged in") ||
    message.includes("unauthorized") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("fetch failed") ||
    message.includes("yahoo finance n") ||
    message.includes("invalid options")
  );
}

/**
 * Donnée de marché indisponible pour l'instant : Yahoo en erreur, limité, coupé par le disjoncteur
 * ou file d'appels saturée (503). Les services dégradent alors proprement au lieu d'échouer.
 */
export function isMarketDataUnavailable(error: unknown) {
  return error instanceof HttpError ? [401, 429, 502, 503].includes(error.status) : isTemporaryYahooError(error);
}

/** Convertit une erreur Yahoo brute en HttpError stable pour l'API backend. */
export function toYahooHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const message = errorMessage(error);
  const code = errorCode(error);

  if (isTemporaryYahooError(error)) {
    const status = code === 401 || message.toLowerCase().includes("unauthorized") ? 401 : 429;
    return new HttpError(status, "Yahoo Finance est temporairement indisponible ou limite les requetes.", {
      provider: "Yahoo Finance",
      cause: message
    });
  }

  return new HttpError(502, "Yahoo Finance n'a pas pu fournir la donnee demandee.", {
    provider: "Yahoo Finance",
    cause: message
  });
}
