import { db } from "../../db.js";

export interface FeatureFlagRow {
  key: string;
  enabled: number;
  updated_at: string;
  updated_by_username: string | null;
}

export class FeatureFlagsRepository {
  list(): FeatureFlagRow[] {
    return db.prepare(
      `SELECT f.key, f.enabled, f.updated_at, u.username AS updated_by_username
       FROM app_feature_flags f
       LEFT JOIN users u ON u.id = f.updated_by`
    ).all() as FeatureFlagRow[];
  }

  upsert(key: string, enabled: boolean, userId: number) {
    db.prepare(
      `INSERT INTO app_feature_flags (key, enabled, updated_at, updated_by)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).run(key, enabled ? 1 : 0, userId);
  }
}

export const featureFlagsRepository = new FeatureFlagsRepository();
