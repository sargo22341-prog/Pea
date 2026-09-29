import type { CalendarEvent, PortfolioDividendEvent } from "@pea/shared";
import { isSamePayment } from "../portfolio/dividends/announced-dividend.js";

const DIVIDEND_EVENT_TYPES = new Set<CalendarEvent["eventType"]>(["ex_dividend", "dividend"]);

/** Versement de la position le plus proche de la date de l'évènement, dans la fenêtre de rapprochement. */
function closestPayment(event: CalendarEvent, payments: readonly PortfolioDividendEvent[]) {
  const eventTime = Date.parse(event.eventDate);
  if (!Number.isFinite(eventTime)) return undefined;
  let closest: PortfolioDividendEvent | undefined;
  let closestGap = Number.POSITIVE_INFINITY;
  for (const payment of payments) {
    const paymentTime = Date.parse(payment.date);
    const gap = Math.abs(paymentTime - eventTime);
    if (Number.isFinite(paymentTime) && isSamePayment(paymentTime, eventTime) && gap < closestGap) {
      closest = payment;
      closestGap = gap;
    }
  }
  return closest;
}

/**
 * Ajoute aux détachements et versements le montant attendu pour la position de l'utilisateur,
 * rapproché des versements calculés par le service des dividendes (réels, annoncés ou estimés).
 * Un versement sans quantité détenue n'apporte aucun montant.
 */
export function withExpectedDividends(events: readonly CalendarEvent[], payments: readonly PortfolioDividendEvent[]): CalendarEvent[] {
  const bySymbol = new Map<string, PortfolioDividendEvent[]>();
  for (const payment of payments) {
    if (!(payment.quantity > 0) || !Number.isFinite(payment.totalAmount)) continue;
    const key = payment.symbol.toUpperCase();
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), payment]);
  }
  return events.map((event) => {
    if (!DIVIDEND_EVENT_TYPES.has(event.eventType)) return event;
    const payment = closestPayment(event, bySymbol.get(event.symbol.toUpperCase()) ?? []);
    if (!payment) return event;
    return {
      ...event,
      expectedDividend: {
        amount: payment.totalAmount,
        amountPerShare: payment.amountPerShare,
        quantity: payment.quantity,
        currency: payment.currency,
        status: payment.status
      }
    };
  });
}
