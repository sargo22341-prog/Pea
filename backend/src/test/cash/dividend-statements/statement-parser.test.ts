import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseDividendStatement } from "../../../services/cash/dividend-statements/parser/statement-parser.js";
import { amountList, StatementFormatError } from "../../../services/cash/dividend-statements/parser/statement-text.js";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "..", "..", "fixtures", "dividend-statements", name), "utf8");
const pick = (statement: ReturnType<typeof parseDividendStatement>) =>
  statement.lines.map((line) => [line.paymentDate, line.isin, line.quantity, line.grossCents, line.withholdingCents, line.netCents]);

const simpleLines = (rows: string[], total: string, summary: string) => [
  "COUPONS REMBOURSEMENTS : AVRIL 2026", "DETAIL COUPONS", ...rows, total, summary, "Feuillet 1/1"
].join("\n");

test("un relevé étranger de plusieurs lignes est lu ligne à ligne, retenues comprises", () => {
  const statement = parseDividendStatement(fixture("foreign-multiple.txt"));
  assert.equal(statement.period, "2024-05");
  assert.deepEqual(pick(statement), [
    ["2024-04-22", "NL00150001Q9", 31, 4805, 719, 4086],
    ["2024-04-26", "NL0010273215", 4, 700, 104, 596],
    ["2024-05-02", "FR0010208488", 101, 8131, 0, 8131],
    ["2024-05-03", "FR0000120644", 4, 840, 0, 840],
    ["2024-05-03", "FR0013451333", 33, 5874, 0, 5874],
    ["2024-05-08", "FR0000124141", 36, 4500, 0, 4500],
    ["2024-05-20", "FR0000120073", 7, 2240, 0, 2240]
  ]);
  assert.equal(statement.totalNetCents, 26_267);
});

test("un remboursement est lu séparément et n'est jamais une ligne de dividende", () => {
  const statement = parseDividendStatement(fixture("foreign-multiple.txt"));
  assert.deepEqual(statement.refunds, [{ lineNo: 1, paymentDate: "2024-05-06", name: "ENGIE", isin: "FR0010208488", quantity: 101, grossCents: 6313, amountCents: 6313 }]);
  assert.ok(!statement.lines.some((line) => line.paymentDate === "2024-05-06"));
});

test("une quantité sur une ligne à part est rattachée à sa ligne de coupon", () => {
  const statement = parseDividendStatement(fixture("irregular-quantity.txt"));
  assert.equal(statement.period, "2025-06");
  assert.deepEqual(pick(statement), [
    ["2025-05-27", "FR0013451333", 32, 6560, 0, 6560],
    ["2025-05-29", "FR0010307819", 5, 1100, 0, 1100],
    ["2025-06-09", "FR0000125007", 6, 1320, 0, 1320],
    ["2025-06-23", "NL0000226223", 32, 247, 37, 210]
  ]);
});

test("un relevé français simple n'a ni retenue ni remboursement", () => {
  const statement = parseDividendStatement(fixture("french-simple.txt"));
  assert.equal(statement.period, "2026-04");
  assert.deepEqual(pick(statement), [["2026-03-31", "FR0000120271", 45, 3825, 0, 3825], ["2026-04-28", "FR0013451333", 35, 7350, 0, 7350]]);
  assert.deepEqual(statement.refunds, []);
});

test("des totaux incohérents refusent le relevé entier", () => {
  const altered = fixture("french-simple.txt").replace("TOTAL EUR 0,00 0,00 111,75 0,00 111,75", "TOTAL EUR 0,00 0,00 111,75 0,00 111,85");
  assert.throws(() => parseDividendStatement(altered), StatementFormatError);
  const summary = fixture("french-simple.txt").replace("COUPONS : NETS FISCAUX 111,75 EUR", "COUPONS : NETS FISCAUX 110,75 EUR");
  assert.throws(() => parseDividendStatement(summary), /récapitulatif/);
});

test("une ligne aux montants incohérents ou des colonnes en blocs séparés sont refusées", () => {
  const rows = ["31/03/2026 45 TOTALENERGIES SE (FR0000120271) 38,25 38,25 37,25"];
  assert.throws(() => parseDividendStatement(simpleLines(rows, "TOTAL EUR 0,00 0,00 38,25 0,00 37,25", "COUPONS : NETS FISCAUX 38,25 EUR")), /incohérente/);
  const blocks = ["31/03/2026", "28/04/2026", "TOTALENERGIES SE (FR0000120271)", "FDJ (FR0013451333)", "38,25 38,25 38,25", "73,50 73,50 73,50"];
  assert.throws(() => parseDividendStatement(simpleLines(blocks, "TOTAL EUR 0,00 0,00 111,75 0,00 111,75", "COUPONS : NETS FISCAUX 111,75 EUR")), StatementFormatError);
});

test("les totaux départagent crédit d'impôt et acompte, une lecture ambiguë est refusée", () => {
  const rows = ["22/04/2026 10 STELLANTIS (NL00150001Q9) 10,00 1,50 8,50 8,50"];
  const credit = parseDividendStatement(simpleLines(rows, "TOTAL EUR 1,50 0,00 8,50 0,00 8,50", "COUPONS : NETS FISCAUX 8,50 EUR"));
  assert.equal(credit.lines[0]?.withholdingCents, 150);
  const prepaid = parseDividendStatement(simpleLines(rows, "TOTAL EUR 0,00 1,50 8,50 0,00 8,50", "COUPONS : NETS FISCAUX 8,50 EUR"));
  assert.equal(prepaid.lines[0]?.withholdingCents, 0);
  const twice = [rows[0] ?? "", "23/04/2026 10 STELLANTIS (NL00150001Q9) 10,00 1,50 8,50 8,50"];
  assert.throws(() => parseDividendStatement(simpleLines(twice, "TOTAL EUR 1,50 1,50 17,00 0,00 17,00", "COUPONS : NETS FISCAUX 17,00 EUR")), /ambigu/);
});

test("un feuillet manquant ou un mois illisible refusent le relevé", () => {
  const twoSheets = fixture("foreign-multiple.txt").replace("Feuillet 2/2", "");
  assert.throws(() => parseDividendStatement(twoSheets), /feuillets manquent/);
  assert.throws(() => parseDividendStatement(fixture("french-simple.txt").replace(/COUPONS REMBOURSEMENTS : AVRIL 2026/g, "RELEVE")), /mois du relevé/);
});

test("les montants français avec séparateur de milliers sont lus au centime", () => {
  assert.deepEqual(amountList("1 234,56 0,07 12 345 678,90"), [123_456, 7, 1_234_567_890]);
  assert.equal(amountList("12,3"), undefined);
});
