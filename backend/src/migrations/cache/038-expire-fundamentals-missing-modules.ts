import { FUNDAMENTALS_FRESH_TTL_S } from "../../services/yahoo/cache/cache.constants.js";
import type { Migration } from "../types.js";

/**
 * Les résumés fundamentals mis en cache avant l'ajout des modules `defaultKeyStatistics`
 * (valorisation, divisions d'actions) et `recommendationTrend` (tendance des analystes) sont
 * marqués périmés plutôt que supprimés : le prochain affichage relance l'appel Yahoo, et
 * l'ancienne donnée reste disponible en repli si Yahoo échoue. Les séries dérivées (`SYM:...`)
 * ne sont pas concernées.
 */
export const expireFundamentalsMissingModulesMigration: Migration = {
  version: 38,
  description: "Marque perimes les fundamentals en cache sans les nouveaux modules",
  appliquer: (db) => {
    db.prepare(
      `UPDATE cache_entries
       SET fetched_at = MIN(fetched_at, CAST(strftime('%s', 'now') AS INTEGER) - ?)
       WHERE scope = 'fundamentals'
         AND key NOT LIKE '%:%'
         AND (json_type(payload, '$.defaultKeyStatistics') IS NULL OR json_type(payload, '$.recommendationTrend') IS NULL)`
    ).run(FUNDAMENTALS_FRESH_TTL_S + 1);
  }
};
