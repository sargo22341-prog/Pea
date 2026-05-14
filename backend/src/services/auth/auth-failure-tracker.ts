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

function readPositiveIntEnv(name: string, fallback: number) {
  if (process.env.NODE_ENV !== "test") return fallback;
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface AuthFailureTrackerOptions {
  resetAfterMs?: number;
  backoffStartThreshold?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  warnThreshold?: number;
  errorThreshold?: number;
  maxEntries?: number;
  now?: () => number;
}

export class AuthFailureTracker {
  private byKey = new Map<string, FailureEntry>();
  private readonly resetAfterMs: number;
  private readonly backoffStartThreshold: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly warnThreshold: number;
  private readonly errorThreshold: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: AuthFailureTrackerOptions = {}) {
    this.resetAfterMs = options.resetAfterMs ?? RESET_AFTER_MS;
    this.backoffStartThreshold = options.backoffStartThreshold ?? BACKOFF_START_THRESHOLD;
    this.backoffBaseMs = options.backoffBaseMs ?? readPositiveIntEnv("PEA_AUTH_BACKOFF_BASE_MS", 1000);
    this.backoffMaxMs = options.backoffMaxMs ?? readPositiveIntEnv("PEA_AUTH_BACKOFF_MAX_MS", 30 * 1000);
    this.warnThreshold = options.warnThreshold ?? WARN_THRESHOLD;
    this.errorThreshold = options.errorThreshold ?? ERROR_THRESHOLD;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  /** Mesure attendue avant prochaine tentative (utiliser pour `await sleep(delayMs)`). */
  delayForKeys(keys: string[]): number {
    const now = this.now();
    let maxDelay = 0;
    for (const key of keys) {
      const entry = this.byKey.get(key);
      if (!entry) continue;
      if (now - entry.lastFailureAt > this.resetAfterMs) {
        this.byKey.delete(key);
        continue;
      }
      if (entry.count < this.backoffStartThreshold) continue;
      const exponent = Math.min(entry.count - this.backoffStartThreshold, 6);
      const delay = Math.min(this.backoffMaxMs, this.backoffBaseMs * 2 ** exponent);
      if (delay > maxDelay) maxDelay = delay;
    }
    return maxDelay;
  }

  recordFailure(input: { ip: string; username: string; reason?: string }) {
    const now = this.now();
    this.cleanup(now);
    const ipKey = `ip:${input.ip}`;
    const userKey = `user:${input.username.toLowerCase()}`;
    let highestCount = 0;
    for (const key of [ipKey, userKey]) {
      const entry = this.byKey.get(key);
      const next: FailureEntry = entry && now - entry.lastFailureAt <= this.resetAfterMs
        ? { count: entry.count + 1, firstFailureAt: entry.firstFailureAt, lastFailureAt: now }
        : { count: 1, firstFailureAt: now, lastFailureAt: now };
      this.byKey.set(key, next);
      if (next.count > highestCount) highestCount = next.count;
    }
    this.trimToMaxEntries();

    const meta = { ip: input.ip, username: input.username, reason: input.reason ?? "invalid-credentials", failureCount: highestCount };
    if (highestCount >= this.errorThreshold) {
      logger.error("auth", "auth brute-force suspected (ERROR threshold)", meta);
    } else if (highestCount >= this.warnThreshold) {
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

  stats() {
    return { entries: this.byKey.size };
  }

  cleanup(now = this.now()) {
    for (const [key, entry] of this.byKey) {
      if (now - entry.lastFailureAt > this.resetAfterMs) this.byKey.delete(key);
    }
  }

  private trimToMaxEntries() {
    while (this.byKey.size > this.maxEntries) {
      const oldestKey = [...this.byKey.entries()].sort((a, b) => a[1].lastFailureAt - b[1].lastFailureAt)[0]?.[0];
      if (!oldestKey) return;
      this.byKey.delete(oldestKey);
    }
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
