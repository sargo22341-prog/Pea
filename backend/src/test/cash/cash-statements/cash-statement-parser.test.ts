import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseCashStatement, type ParsedCashStatement } from "../../../services/cash/cash-statements/parser/cash-statement-parser.js";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "..", "..", "fixtures", "cash-statements", name), "utf8");
const pick = (statement: ParsedCashStatement) =>
  statement.lines.map((line) => [line.operationDate, line.kind, line.amountCents, line.quantity ?? null, line.name ?? null]);

test("ancien format : ouverture du compte, plusieurs achats le même jour, mois lu dans le contenu", () => {
  const statement = parseCashStatement(fixture("legacy-opening.txt"));
  assert.equal(statement.format, "legacy");
  assert.equal(statement.period, "2021-07");
  assert.deepEqual([statement.openingDate, statement.closingDate, statement.openingCents, statement.closingCents], ["2021-06-30", "2021-07-31", 0, 12_455]);
  assert.deepEqual(pick(statement), [
    ["2021-07-06", "deposit", 30_000, null, null],
    ["2021-07-08", "buy", -6120, 1, "DANONE"],
    ["2021-07-08", "buy", -9015, 1, "LEGRAND"],
    ["2021-07-08", "buy", -2410, 2, "ENGIE"]
  ]);
  assert.deepEqual(statement.lines.map((line) => line.lineNo), [1, 2, 3, 4]);
});

test("ancien format : chaque libellé, milliers ambigus tranchés par le solde, coupons et autres crédits", () => {
  const statement = parseCashStatement(fixture("legacy-mixed.txt"));
  assert.equal(statement.period, "2025-12");
  assert.deepEqual(pick(statement), [
    ["2025-12-02", "deposit", 15_000, null, null],
    ["2025-12-02", "deposit", 250_000, null, null],
    ["2025-12-03", "buy", -258_338, 441, "ISHS VI-ISMWSPE EO"],
    ["2025-12-05", "dividend", 1792, 16, "VEOLIA ENVIRON."],
    ["2025-12-08", "capital_repayment", 6125, 98, "ENGIE"],
    ["2025-12-10", "compensation", 6553, null, "AIR LIQUIDE"],
    ["2025-12-15", "sell", 51_240, 5, "LEGRAND"],
    ["2025-12-22", "dividend", 195, 30, "STMICROELECTRONICS"]
  ]);
  assert.deepEqual(statement.lines.map((line) => line.label), [
    "VIR Virement de", "VIR Virement interne depuis", "ACHAT ETRANGER", "COUPONS ECHEANCE", "REMBOURSEMENT TITRES", "LIQUID. INDEMNISATION", "VENTE COMPTANT", "COUPONS ECHEANCE"
  ]);
  assert.deepEqual(statement.lines.filter((line) => line.kind === "dividend").map((line) => line.couponDate), ["2025-12-03", "2025-12-20"]);
});

test("ancien format : un coupon échu en décembre et écrit en janvier est daté de l'année précédente", () => {
  const statement = parseCashStatement(fixture("legacy-year-end.txt"));
  assert.equal(statement.period, "2026-01");
  assert.equal(statement.lines[0]?.couponDate, "2025-12-30");
  assert.equal(statement.closingCents, 2506);
});

test("nouveau format : reprise de solde neutre, date de valeur, valeur sur lignes à part, caractère parasite du nouveau solde", () => {
  const statement = parseCashStatement(fixture("current-account-change.txt"));
  assert.equal(statement.format, "current");
  assert.equal(statement.period, "2026-02");
  assert.deepEqual([statement.openingDate, statement.closingDate, statement.openingCents, statement.closingCents], ["2026-02-06", "2026-02-27", 0, 2028]);
  assert.deepEqual(pick(statement), [
    ["2026-02-09", "balance_transfer", 2506, null, null],
    ["2026-02-12", "deposit", 200_000, null, null],
    ["2026-02-12", "buy", -96_840, 37, "ENGIE"],
    ["2026-02-12", "buy", -103_910, 167, "ISHS VI-ISMWSPE EO"],
    ["2026-02-18", "dividend", 272, 2, "ASML HOLDING"]
  ]);
  assert.deepEqual(statement.lines.map((line) => line.valueDate), ["2026-02-06", "2026-02-12", "2026-02-16", "2026-02-16", "2026-02-18"]);
});

test("nouveau format : vente, remboursement, indemnisation de quantité nulle, plusieurs lignes le même jour", () => {
  const statement = parseCashStatement(fixture("current-mixed.txt"));
  assert.equal(statement.period, "2026-03");
  assert.deepEqual(pick(statement), [
    ["2026-03-05", "dividend", 16_496, 296, "TOTALENERGIES SE"],
    ["2026-03-05", "capital_repayment", 5104, 160, "ENGIE"],
    ["2026-03-05", "dividend", 459, 4, "AIR LIQUIDE"],
    ["2026-03-09", "compensation", 7099, 0, "AIR LIQUIDE"],
    ["2026-03-16", "sell", 131_250, 12, "LEGRAND"],
    ["2026-03-17", "deposit", 200_000, null, null],
    ["2026-03-17", "buy", -361_130, 292, "IS.MS.W.S.P.UC.EUR"]
  ]);
});

test("aucune donnée personnelle n'est conservée : titulaire, IBAN, compte, donneur d'ordre", () => {
  for (const name of ["legacy-mixed.txt", "current-account-change.txt", "current-mixed.txt"]) {
    const serialized = JSON.stringify(parseCashStatement(fixture(name))).toUpperCase();
    for (const secret of ["FICTIVE", "CAMILLE", "DURAND", "FR76", "00000000000", "EXEMPLE", "BOURSOBA"]) {
      assert.ok(!serialized.includes(secret), `${name} ne doit pas conserver « ${secret} »`);
    }
  }
});

test("l'empreinte dépend du contenu lu, pas de la mise en page du texte", () => {
  const text = fixture("legacy-opening.txt");
  const relaid = parseCashStatement(text.replace("Edité le 30/07/2021", "Edité le 01/08/2021").replaceAll(" ", "  ")).fingerprint;
  assert.equal(parseCashStatement(text).fingerprint, relaid);
  assert.notEqual(parseCashStatement(text).fingerprint, parseCashStatement(fixture("legacy-mixed.txt")).fingerprint);
});
