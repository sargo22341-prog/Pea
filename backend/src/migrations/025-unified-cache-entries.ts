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
  },
  defaire: (db) => {
    // Recrée les 6 anciennes tables et copie les données depuis cache_entries par scope.
    // Les TTL `expires_at` propres à `asset_article_cache` sont préservés (sinon NULL).
    db.exec(`
      CREATE TABLE IF NOT EXISTS cached_quotes (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cached_dividends (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cached_news (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cached_fundamentals (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cached_history (cache_key TEXT PRIMARY KEY, symbol TEXT NOT NULL, range TEXT NOT NULL, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS asset_article_cache (symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, cached_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_asset_article_cache_expires_at ON asset_article_cache(expires_at);

      INSERT OR REPLACE INTO cached_quotes (symbol, payload, fetched_at) SELECT key, payload, fetched_at FROM cache_entries WHERE scope = 'quote';
      INSERT OR REPLACE INTO cached_dividends (symbol, payload, fetched_at) SELECT key, payload, fetched_at FROM cache_entries WHERE scope = 'dividends';
      INSERT OR REPLACE INTO cached_news (symbol, payload, fetched_at) SELECT key, payload, fetched_at FROM cache_entries WHERE scope = 'news';
      INSERT OR REPLACE INTO cached_fundamentals (symbol, payload, fetched_at) SELECT key, payload, fetched_at FROM cache_entries WHERE scope = 'fundamentals';
      -- Pour cached_history, le range est encodé dans la clé (SYMBOL:range:interval). On
      -- l'extrait au mieux ; les entrées qui ne respectent pas ce format sont copiées avec
      -- range = '' (rare, ces clés viennent toutes du repository).
      INSERT OR REPLACE INTO cached_history (cache_key, symbol, range, payload, fetched_at)
      SELECT key,
             COALESCE(substr(key, 1, instr(key, ':') - 1), key),
             COALESCE(
               substr(key, instr(key, ':') + 1, instr(substr(key, instr(key, ':') + 1), ':') - 1),
               ''
             ),
             payload, fetched_at
      FROM cache_entries WHERE scope = 'history';
      INSERT OR REPLACE INTO asset_article_cache (symbol, payload, cached_at, expires_at)
      SELECT key, payload, fetched_at, COALESCE(expires_at, fetched_at + 86400000) FROM cache_entries WHERE scope = 'asset_article';

      DROP INDEX IF EXISTS idx_cache_entries_scope;
      DROP INDEX IF EXISTS idx_cache_entries_expires_at;
      DROP TABLE cache_entries;
    `);
  }
};

