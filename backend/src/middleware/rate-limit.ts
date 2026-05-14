import type { RequestHandler } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const rateLimitRegistries = new Set<Map<string, Bucket>>();

export function createRateLimit({
  windowMs,
  max,
  cleanupIntervalMs = windowMs,
  maxBuckets = 10_000
}: {
  windowMs: number;
  max: number;
  cleanupIntervalMs?: number;
  maxBuckets?: number;
}): RequestHandler {
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
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (!oldestKey) return;
      buckets.delete(oldestKey);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > maxBuckets) cleanup(now, true);
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
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
