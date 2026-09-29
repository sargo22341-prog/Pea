import { db } from "../../db.js";

export interface ScreenerPresetRow {
  id: number;
  name: string;
  filters_json: string;
  created_at: string;
}

/** Filtres enregistrés : toute lecture et suppression est limitée à l'utilisateur propriétaire. */
export const screenerPresetsRepository = {
  list(userId: number) {
    return db.prepare("SELECT id, name, filters_json, created_at FROM user_screener_presets WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(userId) as ScreenerPresetRow[];
  },

  count(userId: number) {
    return (db.prepare("SELECT COUNT(*) AS total FROM user_screener_presets WHERE user_id = ?").get(userId) as { total: number }).total;
  },

  /** Crée ou remplace le préréglage du même nom (un nom est unique par utilisateur). */
  save(userId: number, name: string, filtersJson: string) {
    db.prepare(`
      INSERT INTO user_screener_presets (user_id, name, filters_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, name) DO UPDATE SET filters_json = excluded.filters_json
    `).run(userId, name, filtersJson);
    return db.prepare("SELECT id, name, filters_json, created_at FROM user_screener_presets WHERE user_id = ? AND name = ?").get(userId, name) as ScreenerPresetRow;
  },

  exists(userId: number, name: string) {
    return Boolean(db.prepare("SELECT 1 FROM user_screener_presets WHERE user_id = ? AND name = ?").get(userId, name));
  },

  delete(userId: number, id: number) {
    return db.prepare("DELETE FROM user_screener_presets WHERE id = ? AND user_id = ?").run(id, userId) > 0;
  }
};
