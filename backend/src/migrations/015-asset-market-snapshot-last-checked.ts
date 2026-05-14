import type { ColonneDb, Migration } from "./types.js";

export const assetMarketSnapshotLastCheckedMigration: Migration = {
  version: 15,
  description: "Colonne last_checked_at sur asset_market_snapshots pour tracer les rafraichissements live",
  appliquer: (db) => {
    // No-op après la migration 028 (table splittée).
    const tableExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'asset_market_snapshots'").get());
    if (!tableExists) return;
    const colonnes = db.prepare("PRAGMA table_info(asset_market_snapshots)").all() as ColonneDb[];
    if (!colonnes.some((c) => c.name === "last_checked_at")) {
      db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN last_checked_at TEXT");
    }
  }
};
