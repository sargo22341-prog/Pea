import { numberFormatter } from "../format";

/** Montant comptable : toujours deux décimales, contrairement à `money` qui arrondit au-delà de 1 000. */
export function cashMoney(value: number, currency = "EUR") {
  const safeValue = Number.isFinite(value) ? value : 0;
  return numberFormatter({ style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeValue);
}

/** Montant signé (+ pour un crédit des espèces). */
export function signedCashMoney(value: number, currency = "EUR") {
  return `${value > 0 ? "+" : ""}${cashMoney(value, currency)}`;
}

/** Valeur d'un input datetime-local convertie en ISO ; `undefined` si la saisie est illisible. */
export function localInputToIso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
