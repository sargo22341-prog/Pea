import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { extractQuantity } from "../../../services/boursorama/avis-quantity.js";
import { parseAvisOperesText } from "../../../services/boursorama/avisOperesParser.service.js";

// Fixtures anonymisées issues de vrais avis d'opérés : identités, comptes, valeurs et montants fictifs.
function readFixture(name: string) {
  return fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "fixtures", name), "utf8");
}

test("avis d'achat de plus de 1 000 titres : le groupe de milliers appartient à la quantité", () => {
  const [op] = parseAvisOperesText(readFixture("avis-operes.sample-4.txt"), "avis-operes.sample-4.txt");
  assert.ok(op);
  assert.equal(op.sensOperation, "achat");
  assert.equal(op.quantite, 2345);
  assert.equal(op.nomValeur, "FICTIF MONDE UCITS ETF EUR");
  assert.equal(op.isin, "FR0000000001");
  assert.equal(op.coursExecute, 4.21);
  assert.equal(op.montantTotalFrais, 0);
  assert.equal(op.dateExecution, "2026-03-15T10:20:30");
  assert.deepEqual(op.warnings, []);
});

test("avis de vente avec commission seule : sens, montant et frais détectés", () => {
  const [op] = parseAvisOperesText(readFixture("avis-operes.sample-5.txt"), "avis-operes.sample-5.txt");
  assert.ok(op);
  assert.equal(op.sensOperation, "vente");
  assert.equal(op.quantite, 11);
  assert.equal(op.nomValeur, "FICTIF WORLD SWAP UCITS ETF C");
  assert.equal(op.coursExecute, 512.34);
  assert.equal(op.montantTotalFrais, 28.18);
  assert.deepEqual(op.warnings, []);
});

test("quantités groupées avec espace insécable ou espace fine", () => {
  for (const separator of [" ", " "]) {
    const text = `10:20:30\n12${separator}500 FICTIF Référence : 000000000003`;
    assert.equal(extractQuantity(text).quantity, 12500);
  }
});

test("un nom de valeur commençant par trois chiffres est départagé par le montant brut", () => {
  const text = "10:20:30\n2 100 FICTIF CAPITAL Référence : 000000000004";
  assert.deepEqual(extractQuantity(text, { executedPrice: 10, grossAmount: 20 }), { quantity: 2, assetName: "100 FICTIF CAPITAL" });
  assert.deepEqual(extractQuantity(text, { executedPrice: 10, grossAmount: 21000 }), { quantity: 2100, assetName: "FICTIF CAPITAL" });
});

test("une quantité non groupée de plus de trois chiffres reste lue en entier", () => {
  assert.equal(extractQuantity("10:20:30\n1234 FICTIF Référence : 000000000005").quantity, 1234);
  assert.equal(extractQuantity("10:20:30\n12,5 FICTIF Référence : 000000000006").quantity, 12.5);
});
