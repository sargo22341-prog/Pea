import assert from "node:assert/strict";
import test from "node:test";
import { batchContinuity, continuityOf, periodsBetween } from "../../../services/cash/cash-statements/statement-continuity.js";

const statement = (period: string, openingCents: number, closingCents: number, transferCents = 0) => ({ period, openingCents, closingCents, transferCents });

test("mois suivant dont l'ancien solde est le nouveau solde précédent : continu", () => {
  assert.deepEqual(continuityOf(statement("2024-02", 500, 700), statement("2024-01", 100, 500)), { status: "continuous", previousPeriod: "2024-01", missingPeriods: undefined });
  assert.deepEqual(continuityOf(statement("2024-01", 0, 300), undefined), { status: "first" });
});

test("mois suivant dont l'ancien solde diffère : rupture de solde", () => {
  assert.equal(continuityOf(statement("2024-02", 501, 700), statement("2024-01", 100, 500)).status, "balance_break");
});

test("mois manquant : signalé, avec ou sans solde concordant, y compris d'une année sur l'autre", () => {
  assert.deepEqual(periodsBetween("2023-11", "2024-02"), ["2023-12", "2024-01"]);
  assert.deepEqual(continuityOf(statement("2024-02", 500, 700), statement("2023-11", 100, 500)), {
    status: "gap", previousPeriod: "2023-11", missingPeriods: ["2023-12", "2024-01"], balanceMatches: true
  });
  assert.equal(continuityOf(statement("2024-03", 400, 700), statement("2024-01", 100, 500)).balanceMatches, false);
});

test("changement de compte : le relevé part de zéro et reprend le solde précédent, transfert neutre", () => {
  assert.equal(continuityOf(statement("2026-02", 0, 2028, 2506), statement("2026-01", 153_807, 2506)).status, "account_change");
  assert.equal(continuityOf(statement("2026-02", 0, 2028, 2500), statement("2026-01", 153_807, 2506)).status, "balance_break", "une reprise d'un autre montant n'explique pas la rupture");
});

test("continuité d'un lot : chaque relevé est comparé au précédent connu, importé ou du même lot", () => {
  const result = batchContinuity([statement("2024-03", 700, 800), statement("2024-01", 100, 500)], [statement("2023-12", 0, 100), statement("2024-02", 500, 700)]);
  assert.equal(result.get("2024-01")?.status, "continuous");
  assert.equal(result.get("2024-03")?.previousPeriod, "2024-02");
  assert.equal(result.get("2024-03")?.status, "continuous");
});
