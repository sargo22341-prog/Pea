import type { ColonneDb, Migration } from "./types.js";

export const assetMarketSnapshotBidAskMigration: Migration = {
  version: 14,
  description: "Colonnes bid/ask sur asset_market_snapshots pour conserver le snapshot Yahoo dynamique complet",
  appliquer: (db) => {
    const colonnes = db.prepare("PRAGMA table_info(asset_market_snapshots)").all() as ColonneDb[];
    const noms = new Set(colonnes.map((c) => c.name));
    if (!noms.has("bid_price")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN bid_price REAL");
    if (!noms.has("ask_price")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN ask_price REAL");
    if (!noms.has("bid_size")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN bid_size REAL");
    if (!noms.has("ask_size")) db.exec("ALTER TABLE asset_market_snapshots ADD COLUMN ask_size REAL");
  }
};
