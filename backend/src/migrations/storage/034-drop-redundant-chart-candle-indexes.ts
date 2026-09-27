import type { Migration } from "../types.js";

/**
 * La contrainte UNIQUE(asset_id, range_key, interval, datetime_start) de `chart_candles` fournit
 * deja un index sur ces colonnes (et sur tous leurs prefixes). Les deux index explicites en
 * doublaient le contenu (~12 Mo sur une base de 185 000 candles) et ralentissaient chaque ecriture.
 */
export const dropRedundantChartCandleIndexesMigration: Migration = {
  version: 34,
  description: "Supprime les index chart_candles redondants avec la contrainte UNIQUE",
  appliquer: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_chart_candles_asset_range_interval;
      DROP INDEX IF EXISTS idx_chart_candles_asset_range_interval_start;
    `);
  },
  defaire: (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval ON chart_candles(asset_id, range_key, interval);
      CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval_start ON chart_candles(asset_id, range_key, interval, datetime_start);
    `);
  }
};
