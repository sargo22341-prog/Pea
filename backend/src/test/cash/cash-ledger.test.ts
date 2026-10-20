import assert from "node:assert/strict";
import test from "node:test";
import { computeLedger, shortfallCents, tradeCashCents, type LedgerItem } from "../../services/cash/cash-ledger.js";

const noReference = { openingCashCents: 0, openingDepositsCents: 0, openingWithdrawalsCents: 0 };
let sequence = 0;

function item(kind: LedgerItem["kind"], effectiveAt: string, amountCents: number): LedgerItem {
  sequence += 1;
  return { id: `${kind}:${sequence}`, kind, effectiveAt, amountCents, sequence, source: "manual" };
}

test("scénario de référence : un réinvestissement ne crée aucun versement", () => {
  const ledger = computeLedger(noReference, [
    item("deposit", "2026-01-01T10:00:00.000Z", 100_000),
    item("buy", "2026-01-02T10:00:00.000Z", tradeCashCents("buy", 10, 100, 0)),
    item("sell", "2026-02-01T10:00:00.000Z", tradeCashCents("sell", 10, 120, 0)),
    item("buy", "2026-02-02T10:00:00.000Z", tradeCashCents("buy", 9, 100, 0)),
    item("dividend", "2026-03-01T10:00:00.000Z", 3_000),
    item("withdrawal", "2026-04-01T10:00:00.000Z", -10_000)
  ]);
  assert.equal(ledger.depositsCents, 100_000);
  assert.equal(ledger.withdrawalsCents, 10_000);
  assert.equal(ledger.balanceCents, 23_000);
  assert.equal(ledger.dividendsCents, 3_000);
  assert.equal(ledger.minBalanceCents, 0);
  assert.equal(ledger.firstNegativeAt, undefined);
});

test("les frais sont toujours débités, à l'achat comme à la vente", () => {
  assert.equal(tradeCashCents("buy", 3, 10.01, 1.5), -3153);
  assert.equal(tradeCashCents("sell", 3, 10.01, 1.5), 2853);
  assert.equal(tradeCashCents("dividend", 3, 10, 0), 0);
});

test("des mouvements simultanés sont traités dans un ordre déterministe (entrées avant sorties)", () => {
  const at = "2026-05-01T00:00:00.000Z";
  const ledger = computeLedger(noReference, [
    item("withdrawal", at, -500),
    item("buy", at, -1_000),
    item("sell", at, 1_000),
    item("deposit", at, 500)
  ]);
  assert.deepEqual(ledger.entries.map((entry) => entry.kind), ["deposit", "sell", "buy", "withdrawal"]);
  assert.equal(ledger.minBalanceCents, 0, "aucun solde négatif transitoire");
});

test("l'état initial résume l'historique sans compter de versement ni doubler les opérations", () => {
  const ledger = computeLedger(
    { referenceAt: "2026-06-01T00:00:00.000Z", openingCashCents: 5_000, openingDepositsCents: 200_000, openingWithdrawalsCents: 0 },
    [
      item("buy", "2025-01-01T00:00:00.000Z", -150_000),
      item("sell", "2025-06-01T00:00:00.000Z", 20_000),
      item("buy", "2026-07-01T00:00:00.000Z", -4_000)
    ]
  );
  const opening = ledger.entries.find((entry) => entry.kind === "opening");
  assert.ok(opening);
  assert.equal(opening.amountCents, 135_000, "ajustement technique = solde confirmé - historique rejoué");
  assert.equal(opening.balanceAfterCents, 5_000);
  assert.equal(ledger.entries.filter((entry) => entry.absorbed).length, 2);
  assert.equal(ledger.depositsCents, 200_000, "les versements restent ceux déclarés");
  assert.equal(ledger.balanceCents, 1_000);
  assert.equal(ledger.minBalanceCents, 1_000, "l'historique résumé n'entre pas dans le plus bas solde");
});

test("le manque imputé à une mutation ignore une incohérence antérieure mais pas son aggravation", () => {
  assert.equal(shortfallCents({ minBalanceCents: 0 }, { minBalanceCents: -250 }), 250);
  assert.equal(shortfallCents({ minBalanceCents: -100 }, { minBalanceCents: -100 }), 0);
  assert.equal(shortfallCents({ minBalanceCents: -100 }, { minBalanceCents: -300 }), 200);
  assert.equal(shortfallCents({ minBalanceCents: 50 }, { minBalanceCents: 10 }), 0);
});
