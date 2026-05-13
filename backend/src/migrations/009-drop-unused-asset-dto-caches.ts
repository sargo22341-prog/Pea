import type { Migration } from "./types.js";

export const dropUnusedAssetDtoCachesMigration: Migration = {
  version: 9,
  description: "Suppression des tables DTO caches inutilisées",
  appliquer: (db) => {
    db.exec("DROP TABLE IF EXISTS asset_static_cache");
    db.exec("DROP TABLE IF EXISTS asset_market_cache");
    db.exec("DROP TABLE IF EXISTS asset_dividend_cache");
  }
};
