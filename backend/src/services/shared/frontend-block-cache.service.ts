import { cacheRepository } from "../../repositories/cache/cache.repository.js";
import { nowMs } from "./cache.service.js";

export type FrontendBlock =
  | "portfolio-summary"
  | "watchlist"
  | "watchlist-item"
  | "analysis"
  | "dividends";

function key(userId: string | number, block: FrontendBlock, range?: string) {
  return `${userId}:${block}:${range ?? "default"}`;
}

export class FrontendBlockCacheService {
  /** Charge utile JSON mise en cache ; l'appelant la type selon le bloc demande. */
  read(userId: string | number, block: FrontendBlock, range?: string): unknown {
    const row = cacheRepository.readFrontendBlock(key(userId, block, range), nowMs());
    return row ? JSON.parse(row.payload) as unknown : undefined;
  }

  write(userId: string | number, block: FrontendBlock, payload: unknown, ttlMs: number, range?: string) {
    const cachedAt = nowMs();
    const expiresAt = cachedAt + ttlMs;
    cacheRepository.writeFrontendBlock({ cacheKey: key(userId, block, range), userId, block, range, payload, cachedAt, expiresAt });
  }

}

export const frontendBlockCache = new FrontendBlockCacheService();
