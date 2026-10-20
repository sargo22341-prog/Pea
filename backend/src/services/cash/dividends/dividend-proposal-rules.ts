import { DAY_MS } from "@pea/shared";
import { moneyToCents } from "../cash-ledger.js";
import type { WithholdingEstimate } from "./withholding-tax.js";

/**
 * Règles pures des propositions de dividendes : date de paiement, montants brut et net,
 * rapprochement avec un dividende déjà enregistré. Aucun accès à la base.
 */

/**
 * Délai de paiement estimé quand la société n'a pas publié de date : sur Euronext, le paiement
 * intervient en règle générale deux jours de bourse après le détachement (J, record J+1, paiement J+2).
 */
export const ESTIMATED_PAYMENT_DELAY_BUSINESS_DAYS = 2;

/**
 * Écart maximal entre un détachement et une date de paiement publiée pour les rapprocher. Au-delà,
 * la date publiée concerne un autre versement.
 */
export const PAYMENT_DATE_MAX_DELAY_DAYS = 60;

/**
 * Deux crédits du même actif à moins de ce délai sont le même dividende : une saisie manuelle
 * datée du jour de crédit réel rapproche la proposition. Inférieur à l'écart entre deux
 * versements mensuels, pour ne jamais confondre deux dividendes successifs.
 */
export const DIVIDEND_RECONCILIATION_WINDOW_DAYS = 10;

/** Préfixe de la référence d'import d'un dividende validé depuis une proposition. */
export const DIVIDEND_IMPORT_REF_PREFIX = "dividend:";

export function dividendImportRef(symbol: string, exDate: string) {
  return `${DIVIDEND_IMPORT_REF_PREFIX}${symbol.toUpperCase()}:${exDate}`;
}

/** Jour calendaire (UTC) d'une date ISO, clé d'unicité d'un détachement. */
export function isoDay(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Ajoute des jours ouvrés (samedi et dimanche sautés ; jours fériés ignorés). */
export function addBusinessDays(iso: string, days: number) {
  const date = new Date(iso);
  let remaining = days;
  while (remaining > 0) {
    date.setTime(date.getTime() + DAY_MS);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date.toISOString();
}

export interface PaymentDate {
  paymentAt: string;
  estimated: boolean;
}

/**
 * Date de paiement d'un détachement : la première date publiée comprise entre le jour du
 * détachement et `PAYMENT_DATE_MAX_DELAY_DAYS` jours après, sinon une date estimée.
 */
export function resolvePaymentDate(exDividendAt: string, publishedPaymentDates: readonly string[]): PaymentDate {
  const exDayStart = Date.parse(`${isoDay(exDividendAt)}T00:00:00.000Z`);
  const latest = exDayStart + PAYMENT_DATE_MAX_DELAY_DAYS * DAY_MS;
  const published = publishedPaymentDates
    .map((date) => ({ date, time: Date.parse(date) }))
    .filter(({ time }) => Number.isFinite(time) && time >= exDayStart && time <= latest)
    .sort((a, b) => a.time - b.time)[0];
  if (published) return { paymentAt: new Date(published.time).toISOString(), estimated: false };
  return { paymentAt: addBusinessDays(exDividendAt, ESTIMATED_PAYMENT_DELAY_BUSINESS_DAYS), estimated: true };
}

export interface DividendAmounts {
  grossCents: number;
  withholdingCents: number;
  netCents: number;
}

/** Brut = dividende par action × quantité ; net = brut - retenue estimée, arrondis au centime. */
export function dividendAmounts(amountPerShare: number, quantity: number, withholdingRate: number): DividendAmounts {
  const grossCents = Math.max(0, moneyToCents(amountPerShare * quantity));
  const withholdingCents = Math.round(grossCents * withholdingRate);
  return { grossCents, withholdingCents, netCents: grossCents - withholdingCents };
}

/** Un montant en devise étrangère n'est pas converti : il est toujours à vérifier. */
export function proposalNeedsReview(withholding: WithholdingEstimate, currency: string) {
  return withholding.needsReview || currency.toUpperCase() !== "EUR";
}

export interface DividendCredit {
  symbol: string | null | undefined;
  effectiveAt: string;
}

/**
 * Règle de rapprochement : deux crédits de dividende désignent le même versement s'ils portent
 * sur le même actif et sont datés à moins de `DIVIDEND_RECONCILIATION_WINDOW_DAYS` jours. Un
 * dividende saisi sans actif n'est rapproché de rien.
 */
export function isSameDividendCredit(first: DividendCredit, second: DividendCredit) {
  const symbol = first.symbol?.toUpperCase();
  if (!symbol || symbol !== second.symbol?.toUpperCase()) return false;
  const gap = Math.abs(Date.parse(first.effectiveAt) - Date.parse(second.effectiveAt));
  return Number.isFinite(gap) && gap <= DIVIDEND_RECONCILIATION_WINDOW_DAYS * DAY_MS;
}
