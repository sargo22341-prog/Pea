import type { CashLedgerEntryKind, CashMovementSource } from "@pea/shared";

/**
 * Moteur pur du journal espèces : tri chronologique déterministe, solde courant en centimes
 * entiers et état initial de migration. Aucun accès à la base : testable isolément.
 */

/** Ordre de traitement de mouvements simultanés : les entrées d'argent précèdent les sorties. */
const kindPriority: Record<CashLedgerEntryKind, number> = {
  opening: 0,
  deposit: 1,
  dividend: 2,
  sell: 3,
  buy: 4,
  fee: 5,
  withdrawal: 6
};

export function moneyToCents(value: number) {
  return Math.round(value * 100);
}

export function centsToMoney(cents: number) {
  return cents / 100;
}

/** Effet signé d'un achat ou d'une vente sur les espèces : frais toujours débités. */
export function tradeCashCents(type: string, quantity: number, price: number, fees: number | null | undefined) {
  const gross = moneyToCents(quantity * price);
  const feeCents = moneyToCents(fees ?? 0);
  if (type === "sell") return gross - feeCents;
  if (type === "buy") return -(gross + feeCents);
  return 0;
}

export function entryTimeMs(effectiveAt: string) {
  const time = new Date(effectiveAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export interface LedgerAccountState {
  /** État initial : absent pour un journal complet depuis l'ouverture. */
  referenceAt?: string | undefined;
  openingCashCents: number;
  openingDepositsCents: number;
  openingWithdrawalsCents: number;
}

export interface LedgerItem {
  id: string;
  kind: Exclude<CashLedgerEntryKind, "opening">;
  effectiveAt: string;
  /** Effet signé sur les espèces, en centimes. */
  amountCents: number;
  /** Départage stable de deux mouvements de même date et même nature (identifiant SQL). */
  sequence: number;
  source: CashMovementSource;
}

export interface ComputedLedgerEntry<T extends LedgerItem = LedgerItem> {
  item: T | undefined;
  id: string;
  kind: CashLedgerEntryKind;
  effectiveAt: string;
  amountCents: number;
  balanceAfterCents: number;
  absorbed: boolean;
}

export interface LedgerResult<T extends LedgerItem = LedgerItem> {
  /** Mouvements du plus ancien au plus récent, état initial compris. */
  entries: ComputedLedgerEntry<T>[];
  balanceCents: number;
  /** Plus bas solde atteint après l'état initial (ou depuis l'ouverture). */
  minBalanceCents: number;
  firstNegativeAt?: string | undefined;
  depositsCents: number;
  withdrawalsCents: number;
  dividendsCents: number;
  feesCents: number;
}

function compareItems(a: LedgerItem, b: LedgerItem) {
  return entryTimeMs(a.effectiveAt) - entryTimeMs(b.effectiveAt)
    || kindPriority[a.kind] - kindPriority[b.kind]
    || a.sequence - b.sequence
    || a.id.localeCompare(b.id);
}

/** Une opération à la date de référence ou avant est résumée par l'état initial. */
export function isAbsorbed(effectiveAt: string, referenceAt: string | undefined) {
  return referenceAt !== undefined && entryTimeMs(effectiveAt) <= entryTimeMs(referenceAt);
}

/**
 * Rejoue le journal. Sans état initial, le solde part de zéro. Avec un état initial, les
 * opérations antérieures sont rejouées pour l'historique puis un ajustement technique ramène le
 * solde au montant confirmé à la date de référence : cet ajustement n'est jamais un versement.
 */
export function computeLedger<T extends LedgerItem>(account: LedgerAccountState, items: T[]): LedgerResult<T> {
  const sorted = [...items].sort(compareItems);
  const entries: ComputedLedgerEntry<T>[] = [];
  const result: LedgerResult<T> = {
    entries,
    balanceCents: 0,
    minBalanceCents: 0,
    depositsCents: account.referenceAt === undefined ? 0 : account.openingDepositsCents,
    withdrawalsCents: account.referenceAt === undefined ? 0 : account.openingWithdrawalsCents,
    dividendsCents: 0,
    feesCents: 0
  };
  let balance = 0;
  let openingApplied = account.referenceAt === undefined;

  const applyOpening = () => {
    if (openingApplied || account.referenceAt === undefined) return;
    openingApplied = true;
    entries.push({ item: undefined, id: "opening", kind: "opening", effectiveAt: account.referenceAt, amountCents: account.openingCashCents - balance, balanceAfterCents: account.openingCashCents, absorbed: false });
    balance = account.openingCashCents;
    result.minBalanceCents = balance;
  };

  for (const item of sorted) {
    const absorbed = isAbsorbed(item.effectiveAt, account.referenceAt);
    if (!absorbed) applyOpening();
    balance += item.amountCents;
    entries.push({ item, id: item.id, kind: item.kind, effectiveAt: item.effectiveAt, amountCents: item.amountCents, balanceAfterCents: balance, absorbed });
    if (item.kind === "dividend") result.dividendsCents += item.amountCents;
    if (item.kind === "fee") result.feesCents -= item.amountCents;
    if (absorbed) continue;
    if (item.kind === "deposit") result.depositsCents += item.amountCents;
    if (item.kind === "withdrawal") result.withdrawalsCents -= item.amountCents;
    if (balance < result.minBalanceCents) result.minBalanceCents = balance;
    if (balance < 0 && result.firstNegativeAt === undefined) result.firstNegativeAt = item.effectiveAt;
  }
  applyOpening();
  result.balanceCents = balance;
  return result;
}

/**
 * Montant qu'une mutation fait manquer : creusement du plus bas solde sous zéro. Une incohérence
 * déjà présente avant la mutation n'est pas imputée à celle-ci, mais elle ne peut pas s'aggraver.
 */
export function shortfallCents(before: Pick<LedgerResult, "minBalanceCents">, after: Pick<LedgerResult, "minBalanceCents">) {
  return Math.max(0, Math.max(0, -after.minBalanceCents) - Math.max(0, -before.minBalanceCents));
}
