import { db } from "../../db.js";
import { sqlInList, sqlListParam } from "../sql-list.js";

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
  | "asset_article"
  | "insights"
  | "recommendations";

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
    db.prepare(`DELETE FROM cache_entries WHERE scope IN ${sqlInList}`).run(sqlListParam(scopes));
  }

  /**
   * Supprime toutes les entrées d'un scope dont la clé exacte appartient à la liste fournie.
   * Utilisé pour le nettoyage cross-scope d'un symbole donné (ex: cleanup d'asset).
   */
  deleteKeysInScopes(scopes: CacheScope[], keys: string[]): number {
    if (!scopes.length || !keys.length) return 0;
    return db.prepare(
      `DELETE FROM cache_entries WHERE scope IN ${sqlInList} AND key IN ${sqlInList}`
    ).run(sqlListParam(scopes), sqlListParam(keys));
  }

  /**
   * Supprime les entrées d'un scope dont la clé contient un préfixe (utile pour `history`
   * dont les clés sont `${symbol}:${range}:${interval}` et qu'on veut purger par symbole).
   */
  deleteKeysWithPrefix(scope: CacheScope, prefix: string): number {
    return db.prepare("DELETE FROM cache_entries WHERE scope = ? AND key LIKE ?").run(scope, `${prefix}%`);
  }

  /**
   * Purge les fundamentals (calendrier, données financières, consensus, profil...) pour forcer un
   * refetch, en gardant les sous-clés dérivées `:annual-financials`, moins volatiles.
   */
  deleteVolatileFundamentals() {
    return db.prepare("DELETE FROM cache_entries WHERE scope = 'fundamentals' AND key NOT LIKE '%:annual-financials'").run();
  }

  /** Retourne le nombre d'entrées par scope, pour observabilité/admin. */
  countByScope(): { scope: CacheScope; count: number }[] {
    return db.prepare("SELECT scope, COUNT(*) AS count FROM cache_entries GROUP BY scope").all() as { scope: CacheScope; count: number }[];
  }
}

export const unifiedCacheRepository = new UnifiedCacheRepository();
