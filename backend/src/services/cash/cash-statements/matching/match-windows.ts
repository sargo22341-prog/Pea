import { DAY_MS, type CashStatementLineKind } from "@pea/shared";
import { OTHER_CREDIT_MATCH_WINDOW_DAYS } from "../../credits/other-credit-matching.js";

/**
 * Fenêtres de dates du rapprochement, calibrées sur des relevés réels : écart toléré entre la
 * date d'un élément de l'application et la date d'écriture du relevé espèces (en jours, l'écriture
 * pouvant être postérieure : `after`, ou antérieure : `before`).
 */

/** Un achat ou une vente est écrit le jour de l'exécution ou quelques jours après. */
export const TRADE_WRITE_DELAY_DAYS = 5;
/** Un coupon est écrit jusqu'à une douzaine de jours après la date de paiement du relevé de coupons. */
export const COUPON_WRITE_DELAY_DAYS = 15;
/** Un dividende saisi à la main peut être daté de quelques jours après l'écriture. */
export const COUPON_EARLY_WRITE_DAYS = 3;
/** Versement, retrait ou frais saisis à la main : quelques jours d'écart dans les deux sens. */
export const FLOW_MATCH_WINDOW_DAYS = 7;
/** Tolérance d'un jour pour une opération exécutée en soirée (fuseau). */
export const TRADE_EARLY_WRITE_DAYS = 1;

export interface WriteWindow {
  /** Jours maximum entre l'élément et l'écriture du relevé, écriture postérieure. */
  after: number;
  /** Jours maximum, écriture antérieure à la date de l'élément. */
  before: number;
}

export function writeWindow(kind: CashStatementLineKind): WriteWindow | undefined {
  switch (kind) {
    case "buy":
    case "sell":
      return { after: TRADE_WRITE_DELAY_DAYS, before: TRADE_EARLY_WRITE_DAYS };
    case "dividend":
      return { after: COUPON_WRITE_DELAY_DAYS, before: COUPON_EARLY_WRITE_DAYS };
    case "deposit":
    case "withdrawal":
    case "fee":
      return { after: FLOW_MATCH_WINDOW_DAYS, before: FLOW_MATCH_WINDOW_DAYS };
    case "capital_repayment":
    case "compensation":
      return { after: OTHER_CREDIT_MATCH_WINDOW_DAYS, before: OTHER_CREDIT_MATCH_WINDOW_DAYS };
    default:
      return undefined;
  }
}

/** Numéro de jour d'une date `AAAA-MM-JJ`. */
export function dayNumber(isoDay: string) {
  const [year = 0, month = 1, day = 1] = isoDay.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function isoDayOf(dayNo: number) {
  return new Date(dayNo * DAY_MS).toISOString().slice(0, 10);
}

/** L'écriture du relevé (jour `writtenDay`) est-elle compatible avec un élément daté `elementDay` ? */
export function withinWriteWindow(kind: CashStatementLineKind, elementDay: string, writtenDay: string) {
  const window = writeWindow(kind);
  if (!window) return false;
  const delay = dayNumber(writtenDay) - dayNumber(elementDay);
  return delay <= window.after && -delay <= window.before;
}
