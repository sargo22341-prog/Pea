import { ALERT_LIMITS, type AlertEvent, type AlertEventsPage, type AlertParams, type AlertType, type UserAlert } from "@pea/shared";
import { alertsRepository, type AlertEventRow, type AlertRow } from "../../repositories/alerts/alerts.repository.js";
import { HttpError } from "../../utils/http-error.js";
import { featureFlagsService } from "../admin/feature-flags.service.js";
import { marketEventsService } from "../market/events/market-events.service.js";
import { logger } from "../shared/logger.service.js";
import { buildAlertContext, type AlertQuote } from "./alert-context.js";
import { evaluateAlert, type AlertState } from "./alert-evaluation.js";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logger.warn("market-data", "JSON d'alerte illisible, valeur par defaut utilisee", { error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

function toAlert(row: AlertRow): UserAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    assetName: row.asset_name ?? row.symbol,
    currency: row.currency ?? undefined,
    type: row.type,
    params: parseJson<AlertParams>(row.params_json, {}),
    active: row.active === 1,
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    createdAt: row.created_at
  };
}

function toEvent(row: AlertEventRow): AlertEvent {
  return {
    id: row.id,
    alertId: row.alert_id,
    symbol: row.symbol,
    assetName: row.asset_name ?? row.symbol,
    type: row.type,
    triggeredAt: row.triggered_at,
    payload: parseJson(row.payload_json, {}),
    read: row.read_at !== null
  };
}

const notFound = () => new HttpError(404, "Alerte introuvable.");

export const alertsService = {
  list(userId: number): UserAlert[] {
    return alertsRepository.listForUser(userId).map(toAlert);
  },

  get(userId: number, id: number): UserAlert {
    const row = alertsRepository.findForUser(userId, id);
    if (!row) throw notFound();
    return toAlert(row);
  },

  create(userId: number, input: { symbol: string; type: AlertType; params: AlertParams }): UserAlert {
    if (alertsRepository.countForUser(userId) >= ALERT_LIMITS.maxAlertsPerUser) {
      throw new HttpError(400, `Nombre maximal d'alertes atteint (${ALERT_LIMITS.maxAlertsPerUser}).`);
    }
    const id = alertsRepository.create(userId, input.symbol, input.type, JSON.stringify(input.params));
    const created = alertsRepository.findForUser(userId, id);
    if (!created) throw notFound();
    return toAlert(created);
  },

  update(userId: number, id: number, changes: { active?: boolean | undefined; params?: AlertParams | undefined }): UserAlert {
    const updated = alertsRepository.update(userId, id, { active: changes.active, paramsJson: changes.params ? JSON.stringify(changes.params) : undefined });
    const row = updated ? alertsRepository.findForUser(userId, id) : undefined;
    if (!row) throw notFound();
    return toAlert(row);
  },

  remove(userId: number, id: number) {
    if (!alertsRepository.delete(userId, id)) throw notFound();
  },

  events(userId: number, limit: number): AlertEventsPage {
    return { events: alertsRepository.eventsForUser(userId, limit).map(toEvent), unread: alertsRepository.unreadCount(userId) };
  },

  markAllRead(userId: number, now = new Date()) {
    alertsRepository.markAllRead(userId, now.toISOString());
  },

  /**
   * Évalue les alertes actives des cotations qui viennent d'être stockées. Aucun appel Yahoo :
   * MM200, consensus et détachements sont relus en base. Les utilisateurs concernés reçoivent un
   * évènement SSE `alerts-triggered` pour mettre à jour la cloche.
   */
  evaluateQuotes(quotes: readonly AlertQuote[], now = new Date()) {
    if (!featureFlagsService.isEnabled("alerts") || !quotes.length) return { evaluated: 0, triggered: 0 };
    const alerts = alertsRepository.activeForSymbols([...new Set(quotes.map((quote) => quote.symbol.toUpperCase()))]);
    const bySymbol = new Map<string, AlertRow[]>();
    for (const alert of alerts) {
      const key = alert.symbol.toUpperCase();
      bySymbol.set(key, [...(bySymbol.get(key) ?? []), alert]);
    }
    const notifiedUsers = new Set<number>();
    let triggered = 0;

    for (const quote of quotes) {
      const symbolAlerts = bySymbol.get(quote.symbol.toUpperCase());
      if (!symbolAlerts?.length) continue;
      const types = new Set(symbolAlerts.map((alert) => alert.type));
      const context = buildAlertContext(quote, {
        ma200: types.has("ma200_cross"),
        recommendation: types.has("recommendation_change"),
        exDividend: types.has("ex_dividend_announced")
      }, now);
      for (const row of symbolAlerts) {
        const result = evaluateAlert({
          type: row.type,
          params: parseJson<AlertParams>(row.params_json, {}),
          state: parseJson<AlertState>(row.state_json, {}),
          lastTriggeredAt: row.last_triggered_at ?? undefined
        }, context, now);
        const stateJson = JSON.stringify(result.state);
        if (result.event) {
          alertsRepository.recordTrigger(row.id, now.toISOString(), stateJson, JSON.stringify(result.event));
          notifiedUsers.add(row.user_id);
          triggered += 1;
        } else if (stateJson !== row.state_json) {
          alertsRepository.saveState(row.id, stateJson);
        }
      }
    }

    for (const userId of notifiedUsers) marketEventsService.emitToUser(userId, "alerts-triggered", { updatedAt: now.toISOString() });
    return { evaluated: alerts.length, triggered };
  }
};
