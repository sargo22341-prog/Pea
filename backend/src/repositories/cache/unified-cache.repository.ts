import { db } from "../../db.js";

/**
 * Scopes valides pour la table `cache_entries`. L'enum est typé pour empêcher toute clé
 * arbitraire — ajouter une valeur ici implique d'avoir réfléchi à l'invalidation.
 */
export type CacheScope =
  | "quote"
  | "dividends"
  | "news"
  | "fundamentals"
  | "history"
  | "asset_article";

export interface CacheEntryRow {
  scope: CacheScope;
  key: string;
  payload: string;
  fetched_at: number;
  expires_at: number | null;
}

/**
 * Repository unifié pour la table `cache_entries`. Remplace les 6 tables historiques
 * `cached_quotes/dividends/news/fundamentals/history/asset_article_cache`.
 */
export class UnifiedCacheRepository {
  read(scope: CacheScope, key: string): CacheEntryRow | undefined {
    return db.prepare(
      "SELECT scope, key, payload, fetched_at, expires_at FROM cache_entries WHERE scope = ? AND key = ?"
    ).get(scope, key) as CacheEntryRow | undefined;
  }

  write(input: { scope: CacheScope; key: string; payload: unknown; fetchedAt: number; expiresAt?: number }) {
    db.prepare(
      `INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scope, key) DO UPDATE SET
         payload = excluded.payload,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`
    ).run(
      input.scope,
      input.key,
      JSON.stringify(input.payload),
      input.fetchedAt,
      input.expiresAt ?? null
    );
  }

  deleteEntry(scope: CacheScope, key: string) {
    return db.prepare("DELETE FROM cache_entries WHERE scope = ? AND key = ?").run(scope, key);
  }

  deleteScope(scope: CacheScope) {
    return db.prepare("DELETE FROM cache_entries WHERE scope = ?").run(scope);
  }

  deleteScopes(scopes: CacheScope[]) {
    if (!scopes.length) return;
    const placeholders = scopes.map(() => "?").join(",");
    db.prepare(`DELETE FROM cache_entries WHERE scope IN (${placeholders})`).run(...scopes);
  }

  /**
   * Supprime toutes les entrées d'un scope dont la clé exacte appartient à la liste fournie.
   * Utilisé pour le nettoyage cross-scope d'un symbole donné (ex: cleanup d'asset).
   */
  deleteKeysInScopes(scopes: CacheScope[], keys: string[]): number {
    if (!scopes.length || !keys.length) return 0;
    const scopePlaceholders = scopes.map(() => "?").join(",");
    const keyPlaceholders = keys.map(() => "?").join(",");
    return db.prepare(
      `DELETE FROM cache_entries WHERE scope IN (${scopePlaceholders}) AND key IN (${keyPlaceholders})`
    ).run(...scopes, ...keys);
  }

  /**
   * Supprime les entrées d'un scope dont la clé contient un préfixe (utile pour `history`
   * dont les clés sont `${symbol}:${range}:${interval}` et qu'on veut purger par symbole).
   */
  deleteKeysWithPrefix(scope: CacheScope, prefix: string): number {
    return db.prepare("DELETE FROM cache_entries WHERE scope = ? AND key LIKE ?").run(scope, `${prefix}%`);
  }

  /**
   * Purge proactive des entrées dont l'expiration est dépassée (utile pour `asset_article`
   * qui exploite `expires_at`).
   */
  pruneExpired(nowMs: number) {
    return db.prepare("DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ?").run(nowMs);
  }

  /** Retourne le nombre d'entrées par scope, pour observabilité/admin. */
  countByScope(): Array<{ scope: CacheScope; count: number }> {
    return db.prepare("SELECT scope, COUNT(*) AS count FROM cache_entries GROUP BY scope").all() as Array<{ scope: CacheScope; count: number }>;
  }
}

export const unifiedCacheRepository = new UnifiedCacheRepository();
