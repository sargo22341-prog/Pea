import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseCashStatement } from "../../../services/cash/cash-statements/parser/cash-statement-parser.js";
import { StatementFormatError } from "../../../services/cash/cash-statements/parser/cash-statement-text.js";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "..", "..", "fixtures", "cash-statements", name), "utf8");

/** Relevé minimal de l'ancien format : opérations entre l'ancien et le nouveau solde. */
const legacy = (opening: string, rows: string[], closing: string) => [
  "RELEVE COMPTE ESPECES : MARS 2024", "Feuillet 1/1", `29/02/2024 ANCIEN SOLDE ${opening}`, ...rows, `31/03/2024 NOUVEAU SOLDE ${closing}`
].join("\n");

const refused = (text: string, message: RegExp) => {
  assert.throws(() => parseCashStatement(text), (error: unknown) => error instanceof StatementFormatError && message.test(error.message));
};

test("un solde qui ne boucle pas refuse le relevé entier", () => {
  refused(fixture("legacy-opening.txt").replace("NOUVEAU SOLDE 124,55", "NOUVEAU SOLDE 124,56"), /ne donnent pas le nouveau solde/);
  refused(fixture("current-mixed.txt").replace("\t13,06", "\t13,07"), /ne donnent pas le nouveau solde/);
});

test("un libellé inconnu refuse le relevé", () => {
  refused(legacy("10,00", ["05/03/2024 OPERATION MYSTERE 5,00"], "15,00"), /libellé inconnu/);
  refused(fixture("current-mixed.txt").replace("VENTE COMPTANT", "ECHANGE TITRES"), /libellé inconnu/);
});

test("le sens d'un virement générique est donné par le seul bouclage du solde", () => {
  const outgoing = parseCashStatement(legacy("100,00", ["05/03/2024 VIR SEPA VERS COMPTE EXTERNE 40,00"], "60,00"));
  assert.deepEqual(outgoing.lines.map((line) => [line.kind, line.amountCents, line.label]), [["withdrawal", -4000, "VIR"]]);
  const incoming = parseCashStatement(legacy("100,00", ["05/03/2024 VIR SEPA VERS COMPTE EXTERNE 40,00"], "140,00"));
  assert.deepEqual(incoming.lines.map((line) => line.kind), ["deposit"]);
});

test("un nom terminé par un nombre : la lecture à milliers qui ne boucle pas cède à celle qui boucle", () => {
  const statement = parseCashStatement(legacy("200,00", ["05/03/2024 ACHAT COMPTANT 3 AMUNDI ETF 100 123,45"], "76,55"));
  assert.deepEqual(statement.lines.map((line) => [line.amountCents, line.quantity, line.name]), [[-12_345, 3, "AMUNDI ETF 100"]]);
});

test("une lecture ambiguë (deux attributions font boucler le solde) refuse le relevé", () => {
  refused(legacy("10,00", ["05/03/2024 VIR SEPA A 40,00", "06/03/2024 VIR SEPA B 40,00"], "10,00"), /plusieurs lectures/);
});

test("« VIR » n'est reconnu qu'en début de libellé : VEOLIA ENVIRON. reste un coupon", () => {
  const statement = parseCashStatement(legacy("0,00", ["05/03/2024 COUPONS ECHEANCE 04/03 16 VEOLIA ENVIRON. 17,92"], "17,92"));
  assert.deepEqual(statement.lines.map((line) => line.kind), ["dividend"]);
});

test("feuillet ou page manquant, mois introuvable, ligne hors période ou autre document : refus", () => {
  refused(legacy("0,00", [], "0,00").replace("Feuillet 1/1", "Feuillet 1/2"), /feuillets manquent/);
  refused(legacy("0,00", [], "0,00").replace("RELEVE COMPTE ESPECES : MARS 2024", "RELEVE COMPTE ESPECES : MARS 2024\nRELEVE COMPTE ESPECES : AVRIL 2024"), /mois du relevé/);
  refused(legacy("0,00", ["05/04/2024 VIR VIREMENT CREATION COMPTE 5,00"], "5,00"), /hors de sa période/);
  refused(fixture("current-mixed.txt").replace("\t1/1", "\t1/2"), /pages manquent/);
  refused(["COUPONS REMBOURSEMENTS : AVRIL 2026", "DETAIL COUPONS", "Feuillet 1/1"].join("\n"), /non reconnu/);
});
