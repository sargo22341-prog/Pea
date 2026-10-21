import type { Migration } from "../types.js";

/**
 * Les positions entièrement vendues ne figurent plus dans le résumé, les performances par position
 * ni les courbes, et le résumé compte désormais les positions soldées. Les blocs déjà en cache
 * (jusqu'à 72 heures après la clôture) les contiennent encore : ils sont supprimés et se
 * reconstruisent à la prochaine lecture.
 */
export const purgeClosedPositionCachesMigration: Migration = {
  version: 59,
  description: "Purge les caches portefeuille contenant des positions soldees",
  appliquer: (db) => {
    db.exec("DELETE FROM frontend_block_cache");
    db.exec("DELETE FROM portfolio_positions_performance_cache");
    db.exec("DELETE FROM portfolio_chart_cache");
  }
};
