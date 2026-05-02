import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseAvisOperesText } from "../services/boursorama/avisOperesParser.service.js";

function readFixture(name: string) {
  return fs.readFileSync(path.resolve(import.meta.dirname, "fixtures", name), "utf8");
}

test("PDF 1 – DANONE old format with TTF fees: isin, qty, price, fees, date, no warnings", () => {
  const [op] = parseAvisOperesText(readFixture("avis-operes.sample.txt"), "avis-operes.sample.txt");

  assert.equal(op.sensOperation, "achat");
  assert.equal(op.isin, "FR0000120644");
  assert.equal(op.nomValeur, "DANONE");
  assert.equal(op.quantite, 1);
  assert.equal(op.coursExecute, 60.1);
  assert.equal(op.dateExecution, "2024-07-08T09:00:16");
  assert.equal(op.devise, "EUR");
  // commission 0.30 + TTF frais 0.18 = 0.48
  const fees1 = Number(op.montantTotalFrais);
  assert.ok(
    Math.abs(fees1 - 0.48) < 0.001,
    `expected montantTotalFrais ≈ 0.48, got ${op.montantTotalFrais}`
  );
  assert.deepEqual(op.warnings, []);
});

test("PDF 2 – STMICROELECTRONICS old format with empty frais column: isin, qty, price, fees=commission only, no warnings", () => {
  const [op] = parseAvisOperesText(
    readFixture("avis-operes.sample-2.txt"),
    "avis-operes.sample-2.txt"
  );

  assert.equal(op.sensOperation, "achat");
  assert.equal(op.isin, "NL0000226223");
  assert.equal(op.nomValeur, "STMICROELECTRONICS");
  assert.equal(op.quantite, 1);
  assert.equal(op.coursExecute, 31.66);
  assert.equal(op.dateExecution, "2021-07-08T09:00:06");
  assert.equal(op.devise, "EUR");
  // only commission: 0.16, no separate frais row
  const fees2 = Number(op.montantTotalFrais);
  assert.ok(
    Math.abs(fees2 - 0.16) < 0.001,
    `expected montantTotalFrais ≈ 0.16, got ${op.montantTotalFrais}`
  );
  assert.deepEqual(op.warnings, []);
});

test("PDF 3 – ISHS ETF modern format with all-zero fees: isin, qty, price, fees=0, no warnings", () => {
  const [op] = parseAvisOperesText(
    readFixture("avis-operes.sample-3.txt"),
    "avis-operes.sample-3.txt"
  );

  assert.equal(op.sensOperation, "achat");
  assert.equal(op.isin, "IE0002XZSHO1");
  assert.equal(op.nomValeur, "ISHS VI-ISMWSPE EOA");
  assert.equal(op.quantite, 330);
  assert.equal(op.coursExecute, 6.066);
  assert.equal(op.dateExecution, "2025-02-01T12:32:34");
  assert.equal(op.devise, "EUR");
  assert.equal(op.montantTotalFrais, 0);
  assert.deepEqual(op.warnings, []);
});

test("parseAvisOperesText returns empty array for blank input", () => {
  assert.deepEqual(parseAvisOperesText(""), []);
  assert.deepEqual(parseAvisOperesText("   \n  "), []);
});
