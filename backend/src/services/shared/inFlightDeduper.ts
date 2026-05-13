import { logger } from "./logger.service.js";

const inFlight = new Map<string, Promise<unknown>>();

function logDebug(message: string, key: string) {
  logger.debug("cache", `dedupe ${message.toLowerCase()}`, { key });
}

export async function dedupeInFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    logDebug("WAIT", key);
    return existing as Promise<T>;
  }

  logDebug("START", key);
  const promise = Promise.resolve()
    .then(fn)
    .then(
      (result) => {
        logDebug("DONE", key);
        return result;
      },
      (error) => {
        logDebug("ERROR", key);
        throw error;
      }
    )
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
