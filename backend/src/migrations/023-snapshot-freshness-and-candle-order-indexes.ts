import type { ColonneDb, Migration } from "./types.js";

const freshnessColumns = [
  "market_core_updated_at",
  "liquidity_updated_at",
  "range_52w_updated_at",
  "dividend_info_updated_at",
  "market_profile_updated_at"
];

export const snapshotFreshnessAndCandleOrderIndexesMigration: Migration = {
  version: 23,
  description: "Fraicheur par bloc sur asset_market_snapshots et indexes candles ordonnes par date",
  appliquer: (db) => {
    for (const colonne of freshnessColumns) {
      const colonnes = db.prepare("PRAGMA table_info(asset_market_snapshots)").all() as ColonneDb[];
      const noms = new Set(colonnes.map((ligne) => ligne.name));
      if (!noms.has(colonne)) {
        try {
          db.exec(`ALTER TABLE asset_market_snapshots ADD COLUMN ${colonne} TEXT`);
        } catch (error) {
          if (!String(error).toLowerCase().includes("duplicate column")) throw error;
        }
      }
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chart_candles_1d_asset_interval_start ON chart_candles_1d(asset_id, interval, datetime_start);
      CREATE INDEX IF NOT EXISTS idx_chart_candles_1w_asset_interval_start ON chart_candles_1w(asset_id, interval, datetime_start);
      CREATE INDEX IF NOT EXISTS idx_chart_candles_1m_asset_interval_start ON chart_candles_1m(asset_id, interval, datetime_start);
      CREATE INDEX IF NOT EXISTS idx_chart_candles_all_asset_interval_start ON chart_candles_all(asset_id, interval, datetime_start);
    `);
  }
};
