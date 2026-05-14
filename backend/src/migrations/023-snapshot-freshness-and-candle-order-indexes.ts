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
    const snapshotTableExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'asset_market_snapshots'").get());
    if (snapshotTableExists) {
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
    }

    // Indexes par-table : conservés tant que les tables `chart_candles_*` existent encore
    // (i.e. avant que la migration 027 ne les drope). Sur une base neuve, ces tables n'existent
    // plus dès le début ; on skippe gracieusement.
    const tableExists = (table: string) =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
    for (const range of ["1d", "1w", "1m", "all"]) {
      const table = `chart_candles_${range}`;
      if (!tableExists(table)) continue;
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chart_candles_${range}_asset_interval_start ON ${table}(asset_id, interval, datetime_start)`);
    }
  }
};
