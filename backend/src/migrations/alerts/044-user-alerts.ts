import type { Migration } from "../types.js";

/**
 * Alertes des utilisateurs et historique de leurs déclenchements.
 *
 * `state_json` garde la dernière observation (côté de la MM200, plus haut connu, recommandation…)
 * pour détecter un franchissement entre deux rafraîchissements plutôt qu'un simple état.
 */
export const userAlertsMigration: Migration = {
  version: 44,
  description: "Ajoute les alertes des utilisateurs et leurs declenchements",
  appliquer: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        params_json TEXT NOT NULL DEFAULT '{}',
        state_json TEXT NOT NULL DEFAULT '{}',
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
        last_triggered_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_alerts_user ON user_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_alerts_symbol_active ON user_alerts(symbol, active);

      CREATE TABLE IF NOT EXISTS user_alert_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id INTEGER NOT NULL,
        triggered_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        read_at TEXT,
        FOREIGN KEY(alert_id) REFERENCES user_alerts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_alert_events_alert ON user_alert_events(alert_id, triggered_at);
    `);
  }
};
