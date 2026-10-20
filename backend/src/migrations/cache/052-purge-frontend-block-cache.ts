import type { Migration } from "../types.js";

/**
 * Les blocs mis en cache pour l'interface (résumé du portefeuille, dividendes…) restent valides
 * jusqu'à 72 heures après la clôture. Ceux écrits avant le compte espèces (migrations 47 à 51) n'en
 * portent pas l'état : servis tels quels, ils masquaient la popup de configuration d'une base
 * migrée. Ils sont supprimés et se reconstruisent à la prochaine lecture.
 */
export const purgeFrontendBlockCacheMigration: Migration = {
  version: 52,
  description: "Purge les blocs d'interface en cache anterieurs au compte especes",
  appliquer: (db) => {
    db.exec("DELETE FROM frontend_block_cache");
  }
};
