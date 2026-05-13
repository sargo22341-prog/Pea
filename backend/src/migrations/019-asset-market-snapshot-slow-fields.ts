import type { ColonneDb, Migration } from "./types.js";

export const assetMarketSnapshotSlowFieldsMigration: Migration = {
  version: 19,
  description: "Champs fondamentaux lents persistants sur asset_market_snapshots",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(asset_market_snapshots)").all() as ColonneDb[];
    const noms = new Set(colonnes.map((c) => c.name));
    if (!noms.has("average_volume_10d")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN average_volume_10d REAL");
    if (!noms.has("fifty_two_week_low")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN fifty_two_week_low REAL");
    if (!noms.has("fifty_two_week_high")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN fifty_two_week_high REAL");
    if (!noms.has("fifty_two_week_change_percent")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN fifty_two_week_change_percent REAL");
    if (!noms.has("ex_dividend_date")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN ex_dividend_date TEXT");
  }
};
