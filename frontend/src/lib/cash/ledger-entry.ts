import type { CashLedgerEntry } from "@pea/shared";

/** Identifiant du mouvement espèces d'une ligne du journal (`movement:<id>`), absent pour un achat ou une vente. */
export function movementIdOf(entry: Pick<CashLedgerEntry, "id">) {
  return entry.id.startsWith("movement:") ? Number(entry.id.slice("movement:".length)) : undefined;
}

/**
 * Dividende perçu avant l'état initial, lu sur un relevé de coupons certifié (`statement-line:<id>`) :
 * en lecture seule, jamais un mouvement espèces (ni suppression, ni correction, ni fenêtre).
 */
export function isStatementLineEntry(entry: Pick<CashLedgerEntry, "id">) {
  return entry.id.startsWith("statement-line:");
}

/** Libellé de l'actif d'une ligne : symbole et nom, sinon nom et ISIN d'une ligne de relevé sans position. */
export function entryAssetLabel(entry: Pick<CashLedgerEntry, "symbol" | "name" | "isin">) {
  if (entry.symbol) return entry.name && entry.name !== entry.symbol ? `${entry.symbol} - ${entry.name}` : entry.symbol;
  if (entry.isin) return entry.name ? `${entry.name} (${entry.isin})` : entry.isin;
  return undefined;
}

/** Référence d'une ligne de relevé (`2024-05#3`) affichée `05/2024 n° 3`. */
export function formatStatementReference(reference: string | undefined) {
  const match = reference ? /^(\d{4})-(\d{2})#(\d+)$/.exec(reference) : null;
  if (!match) return reference ?? "";
  return `${match[2]}/${match[1]} n° ${match[3]}`;
}

/** Mois d'un relevé (`2024-05`) affiché `05/2024`. */
export function formatStatementPeriod(period: string | undefined) {
  const match = period ? /^(\d{4})-(\d{2})$/.exec(period) : null;
  return match ? `${match[2]}/${match[1]}` : (period ?? "");
}
