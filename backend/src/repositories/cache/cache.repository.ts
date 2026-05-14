import { db } from "../../db.js";
import { unifiedCacheRepository, type CacheScope } from "./unified-cache.repository.js";

export type StaticCacheTarget = { table: string; keyColumn: string };

export class CacheRepository {
  invalidatePortfolioUser(userId: string, symbol?: string) {
    if (symbol) db.prepare("DELETE FROM user_assets WHERE user_id = ? AND symbol = ?").run(userId, symbol.toUpperCase());
    else db.prepare("DELETE FROM user_assets WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM portfolio_chart_cache WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM portfolio_positions_performance_cache WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM frontend_block_cache WHERE user_id = ?").run(userId);
  }

  invalidatePortfolioAll(symbol?: string) {
    if (symbol) db.prepare("DELETE FROM user_assets WHERE symbol = ?").run(symbol.toUpperCase());
    else db.prepare("DELETE FROM user_assets").run();
    db.prepare("DELETE FROM portfolio_chart_cache").run();
    db.prepare("DELETE FROM portfolio_positions_performance_cache").run();
    db.prepare("DELETE FROM frontend_block_cache").run();
  }

  invalidateFrontendBlock(userId?: string | number, block?: string) {
    if (userId && block) return db.prepare("DELETE FROM frontend_block_cache WHERE user_id = ? AND block = ?").run(String(userId), block);
    if (userId) return db.prepare("DELETE FROM frontend_block_cache WHERE user_id = ?").run(String(userId));
    if (block) return db.prepare("DELETE FROM frontend_block_cache WHERE block = ?").run(block);
    return db.prepare("DELETE FROM frontend_block_cache").run();
  }

  invalidateAssetMarket(symbol: string) {
    unifiedCacheRepository.deleteEntry("quote", symbol.toUpperCase());
  }

  invalidateAssetStatic(symbol: string) {
    const key = symbol.toUpperCase();
    unifiedCacheRepository.deleteEntry("fundamentals", key);
    unifiedCacheRepository.deleteEntry("asset_article", key);
    // Les fundamentals dérivés (clé `${symbol}:annual-financials`) doivent aussi sauter.
    unifiedCacheRepository.deleteKeysWithPrefix("fundamentals", `${key}:`);
  }

  invalidateAssetDividends(symbol: string) {
    unifiedCacheRepository.deleteEntry("dividends", symbol.toUpperCase());
  }

  invalidateAssetArticles(symbol: string) {
    unifiedCacheRepository.deleteEntry("asset_article", symbol.toUpperCase());
  }

  /** Lecture cache statique : aujourd'hui ne sert plus que pour `asset_article` (autre cache JSON). */
  readStatic(target: StaticCacheTarget, key: string) {
    if (target.table !== "asset_article_cache") {
      throw new Error(`readStatic ne supporte plus que asset_article_cache (rec=${target.table})`);
    }
    const row = unifiedCacheRepository.read("asset_article", key);
    if (!row) return undefined;
    return {
      payload: row.payload,
      cached_at: row.fetched_at,
      expires_at: row.expires_at ?? Number.MAX_SAFE_INTEGER
    };
  }

  writeStatic(target: StaticCacheTarget, key: string, payload: unknown, cachedAt: number, expiresAt: number) {
    if (target.table !== "asset_article_cache") {
      throw new Error(`writeStatic ne supporte plus que asset_article_cache (rec=${target.table})`);
    }
    const scope: CacheScope = "asset_article";
    unifiedCacheRepository.write({ scope, key, payload, fetchedAt: cachedAt, expiresAt });
  }

  readFrontendBlock(cacheKey: string, nowMs: number) {
    return db.prepare("SELECT payload FROM frontend_block_cache WHERE cache_key = ? AND expires_at > ?")
      .get(cacheKey, nowMs) as { payload: string } | undefined;
  }

  writeFrontendBlock(input: { cacheKey: string; userId: string | number; block: string; range?: string; payload: unknown; cachedAt: number; expiresAt: number }) {
    db.prepare(
      `INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at`
    ).run(input.cacheKey, String(input.userId), input.block, input.range ?? null, JSON.stringify(input.payload), input.cachedAt, input.expiresAt);
  }
}

export const cacheRepository = new CacheRepository();
