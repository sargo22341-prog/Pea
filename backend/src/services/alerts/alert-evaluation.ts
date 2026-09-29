import { ALERT_COOLDOWN_HOURS, HOUR_MS, type AlertEventPayload, type AlertParams, type AlertType } from "@pea/shared";

/** Données de marché déjà stockées pour un actif au moment de l'évaluation. */
export interface AlertMarketContext {
  price?: number | undefined;
  changePercent?: number | undefined;
  fiftyTwoWeekHigh?: number | undefined;
  fiftyTwoWeekLow?: number | undefined;
  ma200?: number | undefined;
  recommendationKey?: string | undefined;
  /** Prochaine date de détachement future connue (calendrier local), ISO. */
  nextExDividendDate?: string | undefined;
  currency?: string | undefined;
}

/** Dernière observation mémorisée entre deux évaluations (détection des franchissements). */
export interface AlertState {
  lastPrice?: number | undefined;
  maSide?: "above" | "below" | undefined;
  high?: number | undefined;
  low?: number | undefined;
  recommendationKey?: string | undefined;
  /** Dernière date de détachement vue, `""` si aucune n'était annoncée. */
  exDividendDate?: string | undefined;
}

export interface EvaluatedAlert {
  type: AlertType;
  params: AlertParams;
  state: AlertState;
  lastTriggeredAt?: string | undefined;
}

export interface AlertEvaluation {
  state: AlertState;
  /** Présent quand l'alerte se déclenche (et n'est pas en période d'anti-rebond). */
  event?: AlertEventPayload | undefined;
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function inCooldown(alert: EvaluatedAlert, now: Date) {
  if (!alert.lastTriggeredAt) return false;
  const last = Date.parse(alert.lastTriggeredAt);
  const hours = alert.params.cooldownHours ?? ALERT_COOLDOWN_HOURS;
  return Number.isFinite(last) && now.getTime() - last < hours * HOUR_MS;
}

/**
 * Seuil de prix : se déclenche au franchissement (ou dès la première observation si le seuil est
 * déjà dépassé), pas à chaque rafraîchissement tant que le cours reste au-delà.
 */
function priceThreshold(alert: EvaluatedAlert, context: AlertMarketContext, above: boolean): AlertEvaluation {
  const { price } = context;
  const threshold = alert.params.threshold;
  if (!isNumber(price) || !isNumber(threshold)) return { state: alert.state };
  const beyond = (value: number) => (above ? value >= threshold : value <= threshold);
  const wasBeyond = isNumber(alert.state.lastPrice) && beyond(alert.state.lastPrice);
  const state = { ...alert.state, lastPrice: price };
  return beyond(price) && !wasBeyond ? { state, event: { price, threshold, currency: context.currency } } : { state };
}

function evaluateRaw(alert: EvaluatedAlert, context: AlertMarketContext): AlertEvaluation {
  const { state } = alert;
  switch (alert.type) {
    case "price_above": return priceThreshold(alert, context, true);
    case "price_below": return priceThreshold(alert, context, false);
    case "daily_change": {
      const { changePercent } = context;
      const threshold = alert.params.threshold;
      if (!isNumber(changePercent) || !isNumber(threshold)) return { state };
      return Math.abs(changePercent) >= threshold ? { state, event: { changePercent, threshold, price: context.price, currency: context.currency } } : { state };
    }
    case "ma200_cross": {
      const { price, ma200 } = context;
      if (!isNumber(price) || !isNumber(ma200)) return { state };
      const side = price >= ma200 ? "above" : "below";
      const next = { ...state, maSide: side } as const;
      if (!state.maSide || state.maSide === side) return { state: next };
      const crossed = side === "above" ? "up" : "down";
      const direction = alert.params.direction ?? "both";
      return direction === "both" || direction === crossed ? { state: next, event: { price, ma200, crossed, currency: context.currency } } : { state: next };
    }
    case "new_52w_high": {
      const { price, fiftyTwoWeekHigh } = context;
      if (!isNumber(price)) return { state };
      // Le plus haut Yahoo intègre déjà la séance : on compare au plus haut vu à l'évaluation précédente.
      const previousHigh = state.high;
      const next = { ...state, high: Math.max(price, fiftyTwoWeekHigh ?? price, previousHigh ?? price) };
      return isNumber(previousHigh) && price > previousHigh ? { state: next, event: { price, previousHigh, currency: context.currency } } : { state: next };
    }
    case "new_52w_low": {
      const { price, fiftyTwoWeekLow } = context;
      if (!isNumber(price)) return { state };
      const previousLow = state.low;
      const next = { ...state, low: Math.min(price, fiftyTwoWeekLow ?? price, previousLow ?? price) };
      return isNumber(previousLow) && price < previousLow ? { state: next, event: { price, previousLow, currency: context.currency } } : { state: next };
    }
    case "recommendation_change": {
      const key = context.recommendationKey;
      if (!key) return { state };
      const next = { ...state, recommendationKey: key };
      return state.recommendationKey && state.recommendationKey !== key
        ? { state: next, event: { previousKey: state.recommendationKey, recommendationKey: key } }
        : { state: next };
    }
    case "ex_dividend_announced": {
      // `""` : observé sans date annoncée. Une date déjà connue à la première observation est
      // mémorisée sans prévenir ; une nouvelle date (ou la première annoncée) déclenche.
      const date = context.nextExDividendDate ?? "";
      const next = { ...state, exDividendDate: date };
      const announced = date !== "" && state.exDividendDate !== undefined && state.exDividendDate !== date;
      return announced ? { state: next, event: { exDividendDate: date } } : { state: next };
    }
  }
}

/**
 * Évalue une alerte sur le contexte de marché courant. L'état est toujours mis à jour ; un
 * déclenchement pendant l'anti-rebond est ignoré (le franchissement est consommé).
 */
export function evaluateAlert(alert: EvaluatedAlert, context: AlertMarketContext, now: Date): AlertEvaluation {
  const result = evaluateRaw(alert, context);
  if (result.event && inCooldown(alert, now)) return { state: result.state };
  return result;
}
