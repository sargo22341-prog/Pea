import type { Migration } from "./types.js";

/**
 * Cache unifié : remplace les 6 tables `cached_*` + `asset_article_cache` par une table unique
 * `cache_entries(scope, key, payload, fetched_at, expires_at)`.
 *
 * Bénéfices :
 *   - Une seule logique d'invalidation (`DELETE FROM cache_entries WHERE scope = ?`).
 *   - Index unique `(scope, key)` partagé pour toutes les lectures.
 *   - Plus de duplication de schéma, plus de risque d'oublier une table à la purge.
 *
 * `cached_intraday_history` est conservé séparément : sa logique de pruning par sliding window
 * sur `trading_day` et son fallback `readLatestIntraday` requièrent des index spécifiques que
 * `cache_entries` ne porte pas — exception documentée.
 *
 * Les données existantes sont copiées avant DROP. La table `expires_at` est conservée pour
 * `asset_article_cache` qui en faisait usage explicite (TTL applicatif).
 */
export const unifiedCacheEntriesMigration: Migration = {
  version: 25,
  description: "Unifie cached_quotes/dividends/news/fundamentals/history/article en cache_entries",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (scope, key)
      );

      CREATE INDEX IF NOT EXISTS idx_cache_entries_scope ON cache_entries(scope);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);
    `);

    const tableExists = (table: string) =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

    if (tableExists("cached_quotes")) {
      db.exec(
        `INSERT OR REPLACE INTO cache_entries (scope, key, payload, fetched_at)
         SELECT 'quote', symbol, payload, fetched_at FROM cached_quotes`
      );
      db.exec("DROP TABLE cached_quotes");
    }

    if (tableExists("cached_dividends")) {
      db.exec(
        `INSERT OR REPLACE INTO cache_entries (scope, key, payload, fetched_at)
         SELECT 'dividends', symbol, payload, fetched_at FROM cached_dividends`
      );
      db.exec("DROP TABLE cached_dividends");
    }

    if (tableExists("cached_news")) {
      db.exec(
        `INSERT OR REPLACE INTO cache_entries (scope, key, payload, fetched_at)
         SELECT 'news', symbol, payload, fetched_at FROM cached_news`
      );
      db.exec("DROP TABLE cached_news");
    }

    if (tableExists("cached_fundamentals")) {
      db.exec(
        `INSERT OR REPLACE INTO cache_entries (scope, key, payload, fetched_at)
         SELECT 'fundamentals', symbol, payload, fetched_at FROM cached_fundamentals`
      );
      db.exec("DROP TABLE cached_fundamentals");
    }

    if (tableExists("cached_history")) {
      db.exec(
        `INSERT OR REPLACE INTO cache_entries (scope, key, payload, fetched_at)
         SELECT 'history', cache_key, payload, fetched_at FROM cached_history`
      );
      db.exec("DROP TABLE cached_history");
    }

    if (tableExists("asset_article_cache")) {
      db.exec(
        `INSERT OR REPLACE INTO cache_entries (scope, key, payload, fetched_at, expires_at)
         SELECT 'asset_article', symbol, payload, cached_at, expires_at FROM asset_article_cache`
      );
      db.exec("DROP TABLE asset_article_cache");
      // L'index lié à la table dropée meurt avec elle ; rien à faire.
    }
  }
};
