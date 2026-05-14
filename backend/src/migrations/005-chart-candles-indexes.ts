import type { Migration } from "./types.js";

export const chartCandlesIndexesMigration: Migration = {
  version: 5,
  description: "Index sur chart_candles pour accélérer les lectures par (asset_id, range, interval) et les suppressions par (asset_id, range)",
  appliquer: (db) => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chart_candles'").all() as Array<{ name: string }>;
    if (tables.length === 0) return;
    // Vérifie que la colonne `range` existe encore (avant la migration 027 qui l'a renommée
    // en `range_key`). Sur une base neuve, le schéma initial inclut directement les indexes
    // par `range_key` ; on skippe gracieusement.
    const columns = db.prepare("PRAGMA table_info(chart_candles)").all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === "range")) return;
    db.exec("CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval ON chart_candles(asset_id, range, interval)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range ON chart_candles(asset_id, range)");
  }
};
