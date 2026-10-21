import type { CashStatementFormat } from "@pea/shared";
import { recognizeLabel, type RecognizedLabel } from "./cash-statement-labels.js";
import { couponDate } from "./cash-statement-text.js";

/**
 * Lignes brutes d'un relevé, avant le choix du sens : chaque ligne porte une ou plusieurs
 * lectures possibles (montant non signé, libellé, valeur), départagées par le bouclage du solde.
 */

export interface RowReading {
  /** Montant non signé, en centimes. */
  amountCents: number;
  label: RecognizedLabel;
  quantity?: number | undefined;
  name?: string | undefined;
  couponDate?: string | undefined;
}

export interface RawRow {
  operationDate: string;
  valueDate?: string | undefined;
  readings: RowReading[];
}

export interface RawStatement {
  format: CashStatementFormat;
  period: string;
  openingDate: string;
  closingDate: string;
  openingCents: number;
  closingCents: number;
  rows: RawRow[];
}

const quantityAndName = /^(-?\d+(?:,\d+)?) (.+)$/;

/** Quantité (signe ignoré : « -98 » sur un remboursement) puis nom abrégé de la valeur. */
export function securityDetail(rest: string): { quantity?: number | undefined; name?: string | undefined } {
  const match = quantityAndName.exec(rest);
  if (match?.[1] && match[2]) return { quantity: Math.abs(Number(match[1].replace(",", "."))), name: match[2].trim() };
  return { name: rest.trim() || undefined };
}

/**
 * Lecture d'une ligne pour un montant donné. `detail` porte la valeur imprimée sur des lignes à
 * part (nouveau format). `undefined` si le libellé est inconnu ou mal formé.
 */
export function rowReading(amountCents: number, labelText: string, operationDate: string, detail: { quantity?: number | undefined; name?: string | undefined } = {}): RowReading | undefined {
  const label = recognizeLabel(labelText);
  if (!label) return undefined;
  if (label.detail === "none") return { amountCents, label };
  if (label.detail === "security") return { amountCents, label, ...securityDetail(label.rest), ...definedOnly(detail) };
  const coupon = /^(\d{2}\/\d{2})(?: (.*))?$/.exec(label.rest);
  if (!coupon?.[1]) return undefined;
  return { amountCents, label, couponDate: couponDate(coupon[1], operationDate), ...securityDetail(coupon[2] ?? ""), ...definedOnly(detail) };
}

function definedOnly(detail: { quantity?: number | undefined; name?: string | undefined }) {
  return Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== undefined)) as typeof detail;
}
