import { db } from "../../db.js";
import { cacheRegistry } from "./cache-registry.service.js";
import { nowMs } from "./cache.service.js";

export type FrontendBlock =
  | "portfolio-summary"
  | "watchlist"
  | "analysis"
  | "dividends";

function key(userId: string | number, block: FrontendBlock, range?: string) {
  return `${userId}:${block}:${range ?? "default"}`;
}

export class FrontendBlockCacheService {
  read<T>(userId: string | number, block: FrontendBlock, range?: string): T | undefined {
    const row = db.prepare("SELECT payload FROM frontend_block_cache WHERE cache_key = ? AND expires_at > ?")
      .get(key(userId, block, range), nowMs()) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as T : undefined;
  }

  write(userId: string | number, block: FrontendBlock, payload: unknown, ttlMs: number, range?: string) {
    const cachedAt = nowMs();
    const expiresAt = cachedAt + ttlMs;
    db.prepare(
      `INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at`
    ).run(key(userId, block, range), String(userId), block, range ?? null, JSON.stringify(payload), cachedAt, expiresAt);
  }

  invalidate(input: { userId?: string | number; block?: FrontendBlock; symbol?: string }) {
    void input.symbol;
    cacheRegistry.invalidate({ type: "frontend-block-changed", userId: input.userId, block: input.block });
  }
}

export const frontendBlockCache = new FrontendBlockCacheService();
