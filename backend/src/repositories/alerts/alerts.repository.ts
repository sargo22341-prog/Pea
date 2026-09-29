import type { AlertType } from "@pea/shared";
import { db } from "../../db.js";

export interface AlertRow {
  id: number;
  user_id: number;
  symbol: string;
  asset_name: string | null;
  currency: string | null;
  type: AlertType;
  params_json: string;
  state_json: string;
  active: number;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AlertEventRow {
  id: number;
  alert_id: number;
  symbol: string;
  asset_name: string | null;
  type: AlertType;
  triggered_at: string;
  payload_json: string;
  read_at: string | null;
}

const ALERT_COLUMNS = "ua.id, ua.user_id, ua.symbol, a.name AS asset_name, a.currency, ua.type, ua.params_json, ua.state_json, ua.active, ua.last_triggered_at, ua.created_at";
const EVENT_COLUMNS = "e.id, e.alert_id, ua.symbol, a.name AS asset_name, ua.type, e.triggered_at, e.payload_json, e.read_at";

/**
 * Alertes et déclenchements. Chaque lecture ou écriture pilotée par un utilisateur filtre sur son
 * identifiant : une alerte d'un autre utilisateur est introuvable (404), jamais modifiée.
 */
export const alertsRepository = {
  listForUser(userId: number) {
    return db.prepare(`SELECT ${ALERT_COLUMNS} FROM user_alerts ua LEFT JOIN assets a ON a.symbol = ua.symbol WHERE ua.user_id = ? ORDER BY ua.created_at DESC, ua.id DESC`).all(userId) as AlertRow[];
  },

  findForUser(userId: number, id: number) {
    return db.prepare(`SELECT ${ALERT_COLUMNS} FROM user_alerts ua LEFT JOIN assets a ON a.symbol = ua.symbol WHERE ua.id = ? AND ua.user_id = ?`).get(id, userId) as AlertRow | undefined;
  },

  countForUser(userId: number) {
    return (db.prepare("SELECT COUNT(*) AS total FROM user_alerts WHERE user_id = ?").get(userId) as { total: number }).total;
  },

  create(userId: number, symbol: string, type: AlertType, paramsJson: string) {
    const result = db.prepare("INSERT INTO user_alerts (user_id, symbol, type, params_json) VALUES (?, ?, ?, ?) RETURNING id").get(userId, symbol, type, paramsJson) as { id: number };
    return result.id;
  },

  /** Nouveaux paramètres : l'état observé repart de zéro pour ne pas comparer à l'ancien seuil. */
  update(userId: number, id: number, changes: { active?: boolean | undefined; paramsJson?: string | undefined }) {
    return db.prepare(`
      UPDATE user_alerts SET
        active = COALESCE(@active, active),
        params_json = COALESCE(@paramsJson, params_json),
        state_json = CASE WHEN @paramsJson IS NULL THEN state_json ELSE '{}' END
      WHERE id = @id AND user_id = @userId
    `).run({ id, userId, active: changes.active === undefined ? null : Number(changes.active), paramsJson: changes.paramsJson ?? null }) > 0;
  },

  delete(userId: number, id: number) {
    return db.prepare("DELETE FROM user_alerts WHERE id = ? AND user_id = ?").run(id, userId) > 0;
  },

  /** Alertes actives des symboles rafraîchis (job live). */
  activeForSymbols(symbols: string[]) {
    if (!symbols.length) return [];
    return db.prepare(`SELECT ${ALERT_COLUMNS} FROM user_alerts ua LEFT JOIN assets a ON a.symbol = ua.symbol WHERE ua.active = 1 AND ua.symbol IN (${symbols.map(() => "?").join(", ")})`).all(...symbols) as AlertRow[];
  },

  saveState(id: number, stateJson: string) {
    db.prepare("UPDATE user_alerts SET state_json = ? WHERE id = ?").run(stateJson, id);
  },

  recordTrigger(id: number, triggeredAt: string, stateJson: string, payloadJson: string) {
    db.transaction(() => {
      db.prepare("UPDATE user_alerts SET state_json = ?, last_triggered_at = ? WHERE id = ?").run(stateJson, triggeredAt, id);
      db.prepare("INSERT INTO user_alert_events (alert_id, triggered_at, payload_json) VALUES (?, ?, ?)").run(id, triggeredAt, payloadJson);
    });
  },

  eventsForUser(userId: number, limit: number) {
    return db.prepare(`
      SELECT ${EVENT_COLUMNS} FROM user_alert_events e
      JOIN user_alerts ua ON ua.id = e.alert_id
      LEFT JOIN assets a ON a.symbol = ua.symbol
      WHERE ua.user_id = ? ORDER BY e.triggered_at DESC, e.id DESC LIMIT ?
    `).all(userId, limit) as AlertEventRow[];
  },

  unreadCount(userId: number) {
    return (db.prepare("SELECT COUNT(*) AS total FROM user_alert_events e JOIN user_alerts ua ON ua.id = e.alert_id WHERE ua.user_id = ? AND e.read_at IS NULL").get(userId) as { total: number }).total;
  },

  markAllRead(userId: number, readAt: string) {
    return db.prepare("UPDATE user_alert_events SET read_at = ? WHERE read_at IS NULL AND alert_id IN (SELECT id FROM user_alerts WHERE user_id = ?)").run(readAt, userId);
  }
};
