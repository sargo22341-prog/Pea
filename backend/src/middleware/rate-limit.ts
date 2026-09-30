import type { RequestHandler } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateCounterOptions {
  windowMs: number;
  max: number;
  cleanupIntervalMs?: number;
  maxBuckets?: number;
}

const rateLimitRegistries = new Set<Map<string, Bucket>>();

/**
 * Compteur à fenêtre fixe par clé (IP, utilisateur...). `tryConsume` renvoie false au-delà de
 * `max` appels dans la fenêtre. Le nombre de clés suivies est borné.
 */
export function createRateCounter({ windowMs, max, cleanupIntervalMs = windowMs, maxBuckets = 10_000 }: RateCounterOptions) {
  const buckets = new Map<string, Bucket>();
  rateLimitRegistries.add(buckets);
  let nextCleanupAt = Date.now() + cleanupIntervalMs;

  function cleanup(now: number, force = false) {
    if (!force && now < nextCleanupAt) return;
    nextCleanupAt = now + cleanupIntervalMs;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    while (buckets.size > maxBuckets) {
      const oldestKey = buckets.keys().next().value;
      if (!oldestKey) return;
      buckets.delete(oldestKey);
    }
  }

  return {
    tryConsume(key: string) {
      const now = Date.now();
      cleanup(now);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        if (buckets.size > maxBuckets) cleanup(now, true);
        return true;
      }
      bucket.count += 1;
      return bucket.count <= max;
    }
  };
}

export function createRateLimit(options: RateCounterOptions): RequestHandler {
  const counter = createRateCounter(options);
  return (req, res, next) => {
    if (!counter.tryConsume(req.ip ?? req.socket.remoteAddress ?? "unknown")) {
      res.status(429).json({ message: "Trop de requêtes vers l’API locale. Ralentissez quelques instants." });
      return;
    }
    next();
  };
}

export function rateLimitStats() {
  let buckets = 0;
  for (const registry of rateLimitRegistries) buckets += registry.size;
  return { buckets };
}
