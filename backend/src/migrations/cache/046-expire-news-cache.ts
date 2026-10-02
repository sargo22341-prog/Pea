import { NEWS_STALE_REJECT_S } from "../../services/yahoo/cache/cache.constants.js";
import type { Migration } from "../types.js";

/**
 * Les flux d'actualités étaient écrits sans `expires_at` : le nettoyage périodique ne les purgeait
 * jamais. Les pages agrégées de `/news-assets` (format v5, clé liée à l'état du portefeuille) sont
 * supprimées, le nouveau format les reconstruit ; les autres flux reçoivent l'expiration (en
 * millisecondes) qu'ils auraient eue à l'écriture.
 */
export const expireNewsCacheMigration: Migration = {
  version: 46,
  description: "Donne une expiration aux actualites en cache et purge les agregats obsoletes",
  appliquer: (db) => {
    db.exec("DELETE FROM cache_entries WHERE scope = 'news' AND key LIKE 'news:assets:%'");
    db.prepare("UPDATE cache_entries SET expires_at = (fetched_at + ?) * 1000 WHERE scope = 'news' AND expires_at IS NULL").run(NEWS_STALE_REJECT_S);
  }
};
