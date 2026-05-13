import type { Migration } from "./types.js";

export const dropAssetChartCacheMigration: Migration = {
  version: 11,
  description: "Suppression asset_chart_cache, table fantôme jamais lue ni écrite",
  appliquer: (db) => {
    db.exec("DROP TABLE IF EXISTS asset_chart_cache");
  }
};
