import type { DividendEvent } from "@pea/shared";
import { getQuantityAtTime, transactionTimeMs, type TransactionRow } from "../portfolio-calculations.js";
import type { PriceSeries } from "../portfolio-series.js";
import type { ReturnFlow } from "./period-returns.js";

/** Historique d'une position : transactions datées (ajustées des divisions) et cours journaliers. */
export interface PositionHistory {
  transactions: TransactionRow[];
  series: PriceSeries;
  dividends: DividendEvent[];
  /** Cours actuel, pour la valeur d'aujourd'hui. */
  currentPrice: number;
}

/**
 * Flux d'une position : achats frais inclus, ventes frais déduits, et dividendes estimés
 * (montant par action × quantité détenue au détachement) jusqu'à `nowMs`.
 */
export function positionFlows(history: PositionHistory, nowMs: number): ReturnFlow[] {
  const flows: ReturnFlow[] = [];
  for (const transaction of history.transactions) {
    const timeMs = transactionTimeMs(transaction.traded_at);
    const gross = transaction.quantity * transaction.price;
    const fees = transaction.total_fees ?? 0;
    if (transaction.type === "buy") flows.push({ timeMs, kind: "buy", amount: gross + fees });
    else if (transaction.type === "sell") flows.push({ timeMs, kind: "sell", amount: gross - fees });
  }
  for (const event of history.dividends) {
    const timeMs = new Date(event.date).getTime();
    if (!Number.isFinite(timeMs) || timeMs > nowMs) continue;
    const quantity = getQuantityAtTime(history.transactions, timeMs);
    if (quantity > 0 && event.amount > 0) flows.push({ timeMs, kind: "dividend", amount: event.amount * quantity });
  }
  return flows;
}

/**
 * Cours d'une position à un instant : dernière clôture connue, à défaut le prix de la dernière
 * transaction (titre sans historique de cours ou acheté avant le début de la série).
 */
export function priceAt(history: PositionHistory, timeMs: number) {
  const { times, closes } = history.series;
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((times[middle] ?? Number.POSITIVE_INFINITY) <= timeMs) low = middle + 1;
    else high = middle;
  }
  const close = low > 0 ? closes[low - 1] : undefined;
  if (close !== undefined) return close;
  let fallback = closes[0] ?? 0;
  for (const transaction of history.transactions) {
    if (transactionTimeMs(transaction.traded_at) > timeMs) break;
    fallback = transaction.price;
  }
  return fallback;
}

/** Valeur de la position à un instant passé : quantité détenue alors × cours de clôture. */
export function positionValueAt(history: PositionHistory, timeMs: number) {
  const quantity = getQuantityAtTime(history.transactions, timeMs);
  return quantity > 0 ? quantity * priceAt(history, timeMs) : 0;
}

/** Valeur actuelle de la position : quantité détenue aujourd'hui × cours actuel. */
export function positionCurrentValue(history: PositionHistory, nowMs: number) {
  const quantity = getQuantityAtTime(history.transactions, nowMs);
  return quantity > 0 ? quantity * history.currentPrice : 0;
}
