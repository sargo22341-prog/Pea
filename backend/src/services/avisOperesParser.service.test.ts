import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  normalizeFrenchNumber,
  parseAvisOperesText,
  parseFrenchDate,
  parseFrenchMoney
} from "./avisOperesParser.service.js";

describe("avis operes parser", () => {
  it("parses the DANONE avis format", () => {
    const text = readFileSync(new URL("./__fixtures__/avis-operes-danone.txt", import.meta.url), "utf8");
    const [operation] = parseAvisOperesText(text, "danone.pdf");

    assert.equal(operation.dateExecution, "2021-07-08T09:00:16");
    assert.equal(operation.quantite, 1);
    assert.equal(operation.nomValeur, "DANONE");
    assert.equal(operation.isin, "FR0000120644");
    assert.equal(operation.sensOperation, "achat");
    assert.equal(operation.coursExecute, 60.1);
    assert.equal(operation.montantBrut, 60.1);
    assert.equal(operation.commission, 0.3);
    assert.equal(operation.frais, 0.18);
    assert.equal(operation.montantTotalFrais, 0.48);
    assert.equal(operation.montantNet, 60.58);
  });

  it("parses the iShares avis format", () => {
    const text = readFileSync(new URL("./__fixtures__/avis-operes-ishares.txt", import.meta.url), "utf8");
    const [operation] = parseAvisOperesText(text, "ishares.pdf");

    assert.equal(operation.dateExecution, "2026-03-27T15:08:41");
    assert.equal(operation.quantite, 339);
    assert.equal(operation.nomValeur, "ISHS VI-ISMWSPE EOA");
    assert.equal(operation.isin, "IE0002XZSHO1");
    assert.equal(operation.sensOperation, "achat");
    assert.equal(operation.coursExecute, 5.888);
    assert.equal(operation.montantBrut, 1996.03);
    assert.equal(operation.commission, 0);
    assert.equal(operation.frais, 0);
    assert.equal(operation.montantTotalFrais, 0);
    assert.equal(operation.montantNet, 1996.03);
  });

  it("parses French numbers and dates", () => {
    assert.equal(normalizeFrenchNumber("1 996,03 €"), 1996.03);
    assert.equal(normalizeFrenchNumber("5.8880"), 5.888);
    assert.equal(parseFrenchMoney("60,58 EUR"), 60.58);
    assert.equal(parseFrenchDate("08/07/2021", "09:00:16"), "2021-07-08T09:00:16");
  });

  it("returns warnings when optional fields are absent", () => {
    const [operation] = parseAvisOperesText("VENTE COMPTANT\n1 TEST Référence : 1", "missing.pdf");

    assert.equal(operation.sensOperation, "vente");
    assert.equal(operation.quantite, 1);
    assert.equal(operation.nomValeur, "TEST");
    assert.equal(operation.montantNet, undefined);
    assert.ok(operation.warnings.includes("Date d'execution non detectee."));
    assert.ok(operation.warnings.includes("Montant net non detecte."));
  });
});
