import type { RequestHandler } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimit({ windowMs, max, cleanupIntervalMs = windowMs }: { windowMs: number; max: number; cleanupIntervalMs?: number }): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let nextCleanupAt = Date.now() + cleanupIntervalMs;

  function cleanup(now: number) {
    if (now < nextCleanupAt) return;
    nextCleanupAt = now + cleanupIntervalMs;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
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
