import { db } from "../../db.js";

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
    db.prepare("DELETE FROM cached_quotes WHERE symbol = ?").run(symbol.toUpperCase());
  }

  invalidateAssetStatic(symbol: string) {
    const key = symbol.toUpperCase();
    db.prepare("DELETE FROM cached_fundamentals WHERE symbol = ?").run(key);
    db.prepare("DELETE FROM asset_article_cache WHERE symbol = ?").run(key);
  }

  invalidateAssetDividends(symbol: string) {
    db.prepare("DELETE FROM cached_dividends WHERE symbol = ?").run(symbol.toUpperCase());
  }

  invalidateAssetArticles(symbol: string) {
    db.prepare("DELETE FROM asset_article_cache WHERE symbol = ?").run(symbol.toUpperCase());
  }

  readStatic(target: StaticCacheTarget, key: string) {
    return db.prepare(`SELECT payload, cached_at, expires_at FROM ${target.table} WHERE ${target.keyColumn} = ?`).get(key) as
      | { payload: string; cached_at: number; expires_at: number }
      | undefined;
  }

  writeStatic(target: StaticCacheTarget, key: string, payload: unknown, cachedAt: number, expiresAt: number) {
    db.prepare(
      `INSERT INTO ${target.table} (${target.keyColumn}, payload, cached_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(${target.keyColumn}) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at`
    ).run(key, JSON.stringify(payload), cachedAt, expiresAt);
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
