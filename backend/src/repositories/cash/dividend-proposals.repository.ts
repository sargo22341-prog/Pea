import type { DividendProposalStatus, WithholdingBasis } from "@pea/shared";
import { db } from "../../db.js";
import { sqlInList, sqlListParam } from "../sql-list.js";

export interface DividendProposalRow {
  id: number;
  user_id: number;
  position_id: number | null;
  symbol: string;
  name: string | null;
  ex_date: string;
  ex_dividend_at: string;
  payment_at: string;
  payment_estimated: number;
  quantity: number;
  amount_per_share: number;
  currency: string;
  gross_cents: number;
  withholding_rate: number;
  withholding_cents: number;
  net_cents: number;
  country: string | null;
  withholding_basis: WithholdingBasis;
  needs_review: number;
  status: DividendProposalStatus;
  movement_id: number | null;
  decided_at: string | null;
}

export interface DividendProposalUpsert {
  positionId: number;
  symbol: string;
  exDate: string;
  exDividendAt: string;
  paymentAt: string;
  paymentEstimated: boolean;
  quantity: number;
  amountPerShare: number;
  currency: string;
  grossCents: number;
  withholdingRate: number;
  withholdingCents: number;
  netCents: number;
  country: string | undefined;
  withholdingBasis: WithholdingBasis;
  needsReview: boolean;
}

export interface ProposalPositionRow {
  id: number;
  symbol: string;
  quantity: number;
}

export interface DividendMovementRow {
  id: number;
  symbol: string | null;
  effective_at: string;
  import_ref: string | null;
}

const PROPOSAL_COLUMNS = "dp.*, COALESCE(p.name, a.name) AS name";
const PROPOSAL_FROM = "cash_dividend_proposals dp LEFT JOIN positions p ON p.id = dp.position_id LEFT JOIN assets a ON a.symbol = dp.symbol";

/**
 * Accès SQL des propositions de dividendes. Chaque requête filtre sur `user_id` : une proposition
 * d'un autre utilisateur est introuvable, jamais lue ni modifiée.
 */
export const dividendProposalsRepository = {
  listPositions(userId: number) {
    return db.prepare("SELECT id, symbol, quantity FROM positions WHERE user_id = ?").all(userId) as ProposalPositionRow[];
  },

  /** ISIN le plus récent connu pour chaque position (renseigné par les avis d'opéré importés). */
  latestIsins(positionIds: number[]) {
    const isins = new Map<number, string>();
    if (!positionIds.length) return isins;
    const rows = db.prepare(
      `SELECT position_id, isin FROM transactions
       WHERE position_id IN ${sqlInList} AND isin IS NOT NULL AND TRIM(isin) <> ''
       ORDER BY id ASC`
    ).all(sqlListParam(positionIds)) as { position_id: number; isin: string }[];
    for (const row of rows) isins.set(row.position_id, row.isin);
    return isins;
  },

  /** Dates de paiement publiées (`asset_calendar_events` de type `dividend`) par symbole. */
  paymentDates(symbols: string[]) {
    const dates = new Map<string, string[]>();
    if (!symbols.length) return dates;
    const rows = db.prepare(
      `SELECT symbol, event_date FROM asset_calendar_events WHERE event_type = 'dividend' AND symbol IN ${sqlInList}`
    ).all(sqlListParam(symbols.map((symbol) => symbol.toUpperCase()))) as { symbol: string; event_date: string }[];
    for (const row of rows) dates.set(row.symbol, [...(dates.get(row.symbol) ?? []), row.event_date]);
    return dates;
  },

  dividendMovements(userId: number) {
    return db.prepare("SELECT id, symbol, effective_at, import_ref FROM cash_movements WHERE user_id = ? AND type = 'dividend'").all(userId) as DividendMovementRow[];
  },

  listForUser(userId: number) {
    return db.prepare(`SELECT ${PROPOSAL_COLUMNS} FROM ${PROPOSAL_FROM} WHERE dp.user_id = ? ORDER BY dp.payment_at DESC, dp.id DESC`).all(userId) as DividendProposalRow[];
  },

  find(userId: number, id: number) {
    return db.prepare(`SELECT ${PROPOSAL_COLUMNS} FROM ${PROPOSAL_FROM} WHERE dp.user_id = ? AND dp.id = ?`).get(userId, id) as DividendProposalRow | undefined;
  },

  /**
   * Crée la proposition, ou rafraîchit ses valeurs tant qu'elle est en attente : une proposition
   * ignorée ou validée n'est plus modifiée par une nouvelle génération.
   */
  upsert(userId: number, input: DividendProposalUpsert) {
    db.prepare(`
      INSERT INTO cash_dividend_proposals (
        user_id, position_id, symbol, ex_date, ex_dividend_at, payment_at, payment_estimated, quantity, amount_per_share, currency,
        gross_cents, withholding_rate, withholding_cents, net_cents, country, withholding_basis, needs_review
      ) VALUES (
        @userId, @positionId, @symbol, @exDate, @exDividendAt, @paymentAt, @paymentEstimated, @quantity, @amountPerShare, @currency,
        @grossCents, @withholdingRate, @withholdingCents, @netCents, @country, @withholdingBasis, @needsReview
      )
      ON CONFLICT(user_id, symbol, ex_date) DO UPDATE SET
        position_id = excluded.position_id, ex_dividend_at = excluded.ex_dividend_at, payment_at = excluded.payment_at,
        payment_estimated = excluded.payment_estimated, quantity = excluded.quantity, amount_per_share = excluded.amount_per_share,
        currency = excluded.currency, gross_cents = excluded.gross_cents, withholding_rate = excluded.withholding_rate,
        withholding_cents = excluded.withholding_cents, net_cents = excluded.net_cents, country = excluded.country,
        withholding_basis = excluded.withholding_basis, needs_review = excluded.needs_review, updated_at = CURRENT_TIMESTAMP
      WHERE cash_dividend_proposals.status = 'pending'
    `).run({
      ...input,
      userId,
      paymentEstimated: Number(input.paymentEstimated),
      needsReview: Number(input.needsReview),
      country: input.country ?? null
    });
  },

  /** Supprime une proposition non validée devenue sans objet (détachement disparu, rapprochée). */
  deleteUndecided(userId: number, id: number) {
    db.prepare("DELETE FROM cash_dividend_proposals WHERE user_id = ? AND id = ? AND status <> 'accepted'").run(userId, id);
  },

  changeStatus(userId: number, id: number, change: { from: DividendProposalStatus; to: DividendProposalStatus; decidedAt: string | null; movementId?: number | null | undefined }) {
    return db.prepare(
      "UPDATE cash_dividend_proposals SET status = ?, decided_at = ?, movement_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND status = ?"
    ).run(change.to, change.decidedAt, change.movementId ?? null, userId, id, change.from) > 0;
  },

  /** Le mouvement d'une proposition validée est supprimé : la proposition redevient en attente. */
  releaseMovement(userId: number, movementId: number) {
    db.prepare(
      "UPDATE cash_dividend_proposals SET status = 'pending', movement_id = NULL, decided_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND movement_id = ?"
    ).run(userId, movementId);
  }
};
