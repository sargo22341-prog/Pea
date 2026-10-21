import assert from "node:assert/strict";
import test from "node:test";
import { computeLedger, type LedgerItem } from "../../services/cash/cash-ledger.js";
import { computeOpeningDividends } from "../../services/cash/opening-dividends.js";
import { isValidIsin, normalizeIsin } from "../../utils/isin.js";

const base = { openingCashCents: 0, openingDepositsCents: 0, openingWithdrawalsCents: 0, approximateTrades: false, publishedGrossCents: 0, publishedNetCents: 0 };

test("dividendes déjà perçus = solde - versements nets + achats - ventes + frais", () => {
  // Versé 10 000, retiré 1 000 ; achats 12 000 (frais compris), ventes 4 500, frais 20 ; solde 1 700.
  const computed = computeOpeningDividends({
    ...base,
    openingCashCents: 170_000,
    openingDepositsCents: 1_000_000,
    openingWithdrawalsCents: 100_000,
    absorbed: [{ kind: "buy", amountCents: -1_200_000 }, { kind: "sell", amountCents: 450_000 }, { kind: "fee", amountCents: -2_000 }, { kind: "dividend", amountCents: 5_000 }],
    publishedNetCents: 22_000
  });
  assert.deepEqual(computed, { buysCents: 1_200_000, sellsCents: 450_000, feesCents: 2_000, otherCreditsCents: 0, impliedCents: 22_000, warnings: [] });
});

test("dividendes déjà perçus : les remboursements de capital et indemnisations résumés en sont déduits", () => {
  // Même solde de 1 700, dont 61,25 de remboursement et 65,53 d'indemnisation : ce ne sont pas des dividendes.
  const computed = computeOpeningDividends({
    ...base,
    openingCashCents: 170_000,
    openingDepositsCents: 1_000_000,
    openingWithdrawalsCents: 100_000,
    absorbed: [{ kind: "buy", amountCents: -1_200_000 }, { kind: "sell", amountCents: 450_000 }, { kind: "fee", amountCents: -2_000 }, { kind: "capital_repayment", amountCents: 6_125 }, { kind: "compensation", amountCents: 6_553 }]
  });
  assert.equal(computed.otherCreditsCents, 12_678);
  assert.equal(computed.impliedCents, 22_000 - 12_678);
});

test("le calcul signale un historique incomplet, approché ou incohérent", () => {
  const negative = computeOpeningDividends({ ...base, openingCashCents: 0, openingDepositsCents: 100_000, absorbed: [{ kind: "buy", amountCents: -50_000 }] });
  assert.equal(negative.impliedCents, -50_000);
  assert.deepEqual(negative.warnings, ["negative"]);
  assert.deepEqual(computeOpeningDividends({ ...base, openingCashCents: 1_000, absorbed: [] }).warnings, ["no_trades"]);
  assert.deepEqual(computeOpeningDividends({ ...base, approximateTrades: true, absorbed: [{ kind: "buy", amountCents: 0 }] }).warnings, ["approximate_trades"]);
  const mismatch = computeOpeningDividends({ ...base, openingCashCents: 100_000, openingDepositsCents: 100_000, absorbed: [{ kind: "buy", amountCents: -40_000 }], publishedNetCents: 10_000 });
  assert.equal(mismatch.impliedCents, 40_000);
  assert.deepEqual(mismatch.warnings, ["mismatch"], "400 € calculés contre 100 € publiés");
  const close = computeOpeningDividends({ ...base, openingCashCents: 100_000, openingDepositsCents: 100_000, absorbed: [{ kind: "buy", amountCents: -12_000 }], publishedNetCents: 10_000 });
  assert.deepEqual(close.warnings, [], "écart sous la tolérance de 50 €");
});

test("journal : les dividendes déclarés remplacent ceux résumés par l'état initial, sans double comptage", () => {
  const items: LedgerItem[] = [
    { id: "d1", kind: "dividend", effectiveAt: "2026-01-10T00:00:00.000Z", amountCents: 3_000, sequence: 1, source: "manual" },
    { id: "d2", kind: "dividend", effectiveAt: "2026-05-10T00:00:00.000Z", amountCents: 1_000, sequence: 2, source: "manual" }
  ];
  const account = { referenceAt: "2026-03-01T00:00:00.000Z", openingCashCents: 50_000, openingDepositsCents: 50_000, openingWithdrawalsCents: 0 };
  assert.equal(computeLedger(account, items).dividendsCents, 4_000, "sans déclaration : dividendes du journal");
  const declared = computeLedger({ ...account, openingDividendsCents: 20_000 }, items);
  assert.equal(declared.dividendsCents, 21_000, "déclaration + dividendes postérieurs");
  assert.equal(declared.balanceCents, 51_000, "le solde n'est pas modifié par la déclaration");
  assert.equal(declared.depositsCents, 50_000);
});

test("ISIN : clé de contrôle vérifiée", () => {
  assert.equal(isValidIsin("FR0000120271"), true);
  assert.equal(isValidIsin("NL0000235190"), true);
  assert.equal(isValidIsin("FR0000120272"), false);
  assert.equal(isValidIsin("LU0000000002"), false);
  assert.equal(normalizeIsin(" fr 0000 120271 "), "FR0000120271");
});
