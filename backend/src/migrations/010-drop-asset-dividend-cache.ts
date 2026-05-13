import type { Migration } from "./types.js";

export const dropAssetDividendCacheMigration: Migration = {
  version: 10,
  description: "Suppression asset_dividend_cache si toujours présente après migration 9",
  appliquer: (db) => {
    db.exec("DROP TABLE IF EXISTS asset_dividend_cache");
  }
};
