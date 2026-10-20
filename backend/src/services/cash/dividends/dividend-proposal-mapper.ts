import { DAY_MS, DIVIDEND_RECENT_DAYS, type DividendProposal } from "@pea/shared";
import type { DividendProposalRow } from "../../../repositories/cash/dividend-proposals.repository.js";
import { centsToMoney } from "../cash-ledger.js";

export function toProposal(row: DividendProposalRow): DividendProposal {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name ?? row.symbol,
    positionId: row.position_id ?? undefined,
    exDividendAt: row.ex_dividend_at,
    paymentAt: row.payment_at,
    paymentEstimated: row.payment_estimated === 1,
    quantity: row.quantity,
    amountPerShare: row.amount_per_share,
    currency: row.currency,
    grossAmount: centsToMoney(row.gross_cents),
    withholdingRate: row.withholding_rate,
    withholdingAmount: centsToMoney(row.withholding_cents),
    netAmount: centsToMoney(row.net_cents),
    country: row.country ?? undefined,
    withholdingBasis: row.withholding_basis,
    needsReview: row.needs_review === 1,
    status: row.status,
    decidedAt: row.decided_at ?? undefined,
    autoAccepted: row.auto_accepted === 1,
    notificationRead: row.notification_read_at !== null,
    creditedAmount: row.credited_cents === null ? undefined : centsToMoney(row.credited_cents),
    creditedAt: row.credited_at ?? undefined
  };
}

/** Une proposition n'est visible (et validable) qu'à partir de sa date de paiement. */
export function isPaid(row: Pick<DividendProposalRow, "payment_at">, now: Date) {
  return Date.parse(row.payment_at) <= now.getTime();
}

export function isUnreadAutoAccepted(row: DividendProposalRow) {
  return row.status === "accepted" && row.auto_accepted === 1 && row.notification_read_at === null;
}

/** Validée depuis moins de `DIVIDEND_RECENT_DAYS` jours, ou ajout automatique encore non lu. */
export function isRecent(row: DividendProposalRow, now: Date) {
  if (row.status !== "accepted" || row.movement_id === null) return false;
  const decidedAt = row.decided_at === null ? Number.NaN : Date.parse(row.decided_at);
  return isUnreadAutoAccepted(row) || (Number.isFinite(decidedAt) && now.getTime() - decidedAt <= DIVIDEND_RECENT_DAYS * DAY_MS);
}
