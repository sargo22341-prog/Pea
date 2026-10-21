import assert from "node:assert/strict";
import test from "node:test";
import type { CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import { computeLedger, type LedgerItem } from "../../../services/cash/cash-ledger.js";
import { OTHER_CREDIT_MATCH_WINDOW_DAYS, hasNearbyOtherAmount, otherCreditCandidates, type DocumentCredit } from "../../../services/cash/credits/other-credit-matching.js";

const dayMs = 24 * 60 * 60 * 1000;
const paidAt = "2026-05-06T12:00:00.000Z";
const shifted = (days: number) => new Date(new Date(paidAt).getTime() + days * dayMs).toISOString();

let nextId = 1;
function movement(overrides: Partial<CashMovementRow>): CashMovementRow {
  return {
    id: nextId++, user_id: 1, type: "capital_repayment", amount_cents: 6125, effective_at: paidAt, position_id: 7, symbol: "ENGI.PA",
    source: "manual", import_ref: null, note: null, verification: null, verified_at: null, verification_ref: null, ...overrides
  };
}

const credit: DocumentCredit = { type: "capital_repayment", amountCents: 6125, effectiveAt: paidAt, positionId: 7, reference: "2026-05#R1" };

test("autres crédits : même type, montant au centime, date dans la fenêtre, actif compatible", () => {
  const ids = (rows: CashMovementRow[]) => otherCreditCandidates(rows, credit).map((row) => row.id);
  const atEdge = movement({ effective_at: shifted(OTHER_CREDIT_MATCH_WINDOW_DAYS) });
  const beyond = movement({ effective_at: shifted(OTHER_CREDIT_MATCH_WINDOW_DAYS + 1) });
  assert.deepEqual(ids([atEdge, beyond]), [atEdge.id], "borne incluse, au-delà exclue");
  assert.deepEqual(ids([movement({ amount_cents: 6124 })]), [], "un centime d'écart n'est pas le même crédit");
  assert.deepEqual(ids([movement({ type: "compensation" })]), [], "un autre type n'est pas le même crédit");
  assert.deepEqual(ids([movement({ position_id: 8 })]), [], "deux actifs différents ne se rapprochent pas");
  const unlinked = movement({ position_id: null, symbol: null });
  assert.deepEqual(ids([unlinked]), [unlinked.id], "une saisie sans actif est rapprochée sur le montant et la date");
  assert.deepEqual(ids([movement({ verification: "document", verification_ref: "2026-05#R2" })]), [], "déjà rapproché d'une autre ligne");
  assert.equal(hasNearbyOtherAmount([movement({ amount_cents: 6000 })], credit), true);
  assert.equal(hasNearbyOtherAmount([movement({ amount_cents: 6000, position_id: 8 })], credit), false);
});

test("journal : les autres crédits alimentent le solde, jamais versements, dividendes ni plafond", () => {
  const item = (id: string, kind: LedgerItem["kind"], amountCents: number, effectiveAt: string): LedgerItem => ({ id, kind, amountCents, effectiveAt, sequence: Number(id.slice(1)), source: "manual" });
  const result = computeLedger({ referenceAt: "2026-03-01T00:00:00.000Z", openingCashCents: 10_000, openingDepositsCents: 50_000, openingWithdrawalsCents: 0 }, [
    item("m1", "capital_repayment", 6_125, "2025-05-06T12:00:00.000Z"),
    item("m2", "capital_repayment", 5_104, "2026-05-05T12:00:00.000Z"),
    item("m3", "compensation", 6_553, "2026-06-10T12:00:00.000Z"),
    item("m4", "buy", -20_000, "2026-06-10T12:00:00.000Z")
  ]);
  assert.equal(result.balanceCents, 10_000 + 5_104 + 6_553 - 20_000);
  assert.equal(result.otherCreditsCents, 11_657, "le remboursement résumé par l'état initial n'est pas compté");
  assert.deepEqual([result.depositsCents, result.dividendsCents], [50_000, 0]);
  assert.equal(result.minBalanceCents, 1_657, "à date égale, l'indemnisation est créditée avant l'achat");
});
