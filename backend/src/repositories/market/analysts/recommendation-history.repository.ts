import { db } from "../../../db.js";

interface RecommendationChangeRow {
  asset_id: number;
  recommendation_key: string;
  previous_key: string;
  recorded_at: string;
}

export class RecommendationHistoryRepository {
  latestKey(assetId: number): string | undefined {
    const row = db.prepare(
      "SELECT recommendation_key FROM asset_recommendation_history WHERE asset_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1"
    ).get(assetId) as { recommendation_key: string } | undefined;
    return row?.recommendation_key;
  }

  insert(assetId: number, recommendationKey: string, recordedAt: string) {
    db.prepare("INSERT INTO asset_recommendation_history (asset_id, recommendation_key, recorded_at) VALUES (?, ?, ?)").run(assetId, recommendationKey, recordedAt);
  }

  /** Dernier changement de chaque actif enregistré depuis `sinceIso`, avec la recommandation précédente. */
  recentChanges(assetIds: number[], sinceIso: string): RecommendationChangeRow[] {
    if (!assetIds.length) return [];
    return db.prepare(
      `SELECT asset_id, recommendation_key, previous_key, recorded_at FROM (
         SELECT asset_id, recommendation_key, recorded_at,
                LAG(recommendation_key) OVER (PARTITION BY asset_id ORDER BY recorded_at, id) AS previous_key,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY recorded_at DESC, id DESC) AS rank
         FROM asset_recommendation_history
         WHERE asset_id IN (${assetIds.map(() => "?").join(", ")})
       )
       WHERE rank = 1 AND previous_key IS NOT NULL AND recorded_at >= ?`
    ).all(...assetIds, sinceIso) as RecommendationChangeRow[];
  }
}

export const recommendationHistoryRepository = new RecommendationHistoryRepository();
