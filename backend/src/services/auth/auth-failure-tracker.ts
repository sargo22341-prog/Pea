import { logger } from "../shared/logger.service.js";

/**
 * Tracking des tentatives d'authentification échouées en mémoire.
 *
 * Ce tracker est complémentaire au rate-limiter Express (20 req / 15min) qui s'applique de
 * manière naïve sur l'IP. Ici on distingue deux clés (`ip` ET `username`) avec backoff
 * exponentiel : un attaquant qui essaie un même login sera ralenti progressivement, et un
 * attaquant qui distribue les tentatives par IP sera tout de même observable via la clé
 * username.
 *
 * Politique :
 *   - À partir de 3 échecs consécutifs, on impose un délai exponentiel (1s, 2s, 4s, 8s, max 30s)
 *     avant que la prochaine tentative soit traitée.
 *   - À partir de 5 échecs : log WARN "brute-force suspected" pour visibilité opérationnelle.
 *   - À partir de 10 échecs : log ERROR. Le rate-limiter reste l'arrêt dur, mais cet event
 *     remonte dans error.log pour les outils d'alerting.
 *   - Reset automatique au bout de 30min sans tentative, ou immédiatement après un succès.
 */

interface FailureEntry {
  count: number;
  firstFailureAt: number;
  lastFailureAt: number;
}

const RESET_AFTER_MS = 30 * 60 * 1000;
const WARN_THRESHOLD = 5;
const ERROR_THRESHOLD = 10;
const BACKOFF_START_THRESHOLD = 3;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30 * 1000;

class AuthFailureTracker {
  private byKey = new Map<string, FailureEntry>();

  /** Mesure attendue avant prochaine tentative (utiliser pour `await sleep(delayMs)`). */
  delayForKeys(keys: string[]): number {
    const now = Date.now();
    let maxDelay = 0;
    for (const key of keys) {
      const entry = this.byKey.get(key);
      if (!entry) continue;
      if (now - entry.lastFailureAt > RESET_AFTER_MS) {
        this.byKey.delete(key);
        continue;
      }
      if (entry.count < BACKOFF_START_THRESHOLD) continue;
      const exponent = Math.min(entry.count - BACKOFF_START_THRESHOLD, 6);
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
      if (delay > maxDelay) maxDelay = delay;
    }
    return maxDelay;
  }

  recordFailure(input: { ip: string; username: string; reason?: string }) {
    const now = Date.now();
    const ipKey = `ip:${input.ip}`;
    const userKey = `user:${input.username.toLowerCase()}`;
    let highestCount = 0;
    for (const key of [ipKey, userKey]) {
      const entry = this.byKey.get(key);
      const next: FailureEntry = entry && now - entry.lastFailureAt <= RESET_AFTER_MS
        ? { count: entry.count + 1, firstFailureAt: entry.firstFailureAt, lastFailureAt: now }
        : { count: 1, firstFailureAt: now, lastFailureAt: now };
      this.byKey.set(key, next);
      if (next.count > highestCount) highestCount = next.count;
    }

    const meta = { ip: input.ip, username: input.username, reason: input.reason ?? "invalid-credentials", failureCount: highestCount };
    if (highestCount >= ERROR_THRESHOLD) {
      logger.error("auth", "auth brute-force suspected (ERROR threshold)", meta);
    } else if (highestCount >= WARN_THRESHOLD) {
      logger.warn("auth", "auth brute-force suspected", meta);
    } else {
      logger.warn("auth", "auth login failed", meta);
    }
  }

  recordSuccess(input: { ip: string; username: string }) {
    this.byKey.delete(`ip:${input.ip}`);
    this.byKey.delete(`user:${input.username.toLowerCase()}`);
  }

  /** API de test : reset complet du tracker. */
  resetForTesting() {
    this.byKey.clear();
  }

  /** Snapshot lecture seule pour debug/admin. */
  snapshot() {
    return [...this.byKey.entries()].map(([key, entry]) => ({ key, ...entry }));
  }
}

export const authFailureTracker = new AuthFailureTracker();

export function clientIpFrom(req: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }): string {
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    (Array.isArray(req.headers?.["x-forwarded-for"]) ? req.headers!["x-forwarded-for"]![0] : (req.headers?.["x-forwarded-for"] as string | undefined)) ||
    "unknown"
  );
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
