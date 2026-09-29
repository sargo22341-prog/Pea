import { db } from "../../../db.js";

interface AssetSplitRow {
  id: number;
  asset_id: number;
  split_date: string;
  numerator: number;
  denominator: number;
  source: string;
  detected_at: string;
}

export type AssetSplitSource = "yahoo-chart" | "yahoo-key-statistics";

export class AssetSplitsRepository {
  listByAsset(assetId: number): AssetSplitRow[] {
    return db.prepare("SELECT * FROM asset_splits WHERE asset_id = ? ORDER BY split_date ASC").all(assetId) as AssetSplitRow[];
  }

  /** Insère une division ; une division déjà connue à la même date est conservée telle quelle. */
  insert(assetId: number, input: { date: string; numerator: number; denominator: number; source: AssetSplitSource }) {
    const changes = db.prepare(
      `INSERT INTO asset_splits (asset_id, split_date, numerator, denominator, source)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(asset_id, split_date) DO NOTHING`
    ).run(assetId, input.date, input.numerator, input.denominator, input.source);
    return changes > 0;
  }
}

export const assetSplitsRepository = new AssetSplitsRepository();
