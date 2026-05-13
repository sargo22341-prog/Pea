import type { Migration } from "./types.js";

export const marketDataFinalizationsIndexMigration: Migration = {
  version: 18,
  description: "Index market_data_finalizations par asset/range/date pour accélérer la lecture des dernières finalisations",
  appliquer: (db) => {
    db.exec("CREATE INDEX IF NOT EXISTS idx_market_data_finalizations_asset_range_date ON market_data_finalizations(asset_id, range, trading_date DESC)");
  }
};
