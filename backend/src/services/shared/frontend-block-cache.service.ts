import { cacheRepository } from "../../repositories/cache/cache.repository.js";
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
    const row = cacheRepository.readFrontendBlock(key(userId, block, range), nowMs());
    return row ? JSON.parse(row.payload) as T : undefined;
  }

  write(userId: string | number, block: FrontendBlock, payload: unknown, ttlMs: number, range?: string) {
    const cachedAt = nowMs();
    const expiresAt = cachedAt + ttlMs;
    cacheRepository.writeFrontendBlock({ cacheKey: key(userId, block, range), userId, block, range, payload, cachedAt, expiresAt });
  }

  invalidate(input: { userId?: string | number; block?: FrontendBlock; symbol?: string }) {
    void input.symbol;
    cacheRegistry.invalidate({ type: "frontend-block-changed", userId: input.userId, block: input.block });
  }
}

export const frontendBlockCache = new FrontendBlockCacheService();
