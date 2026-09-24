import assert from "node:assert/strict";
import test from "node:test";
import { extractNotes, resetNotes } from "../release-notes.mjs";

const header = "# Notes de la prochaine version\n\nMode d'emploi.\n\n<!-- notes -->";

test("extractNotes renvoie les notes sous le marqueur sans lignes vides autour", () => {
  const text = `${header}\n\n- ajoute A\n\n- corrige B\n\n\n`;
  assert.equal(extractNotes(text), "- ajoute A\n\n- corrige B\n");
});

test("extractNotes accepte les fins de ligne Windows et renvoie une chaîne vide sans notes", () => {
  assert.equal(extractNotes(`${header}\r\n- ajoute A\r\n`.replace(/\n/g, "\r\n")), "- ajoute A\n");
  assert.equal(extractNotes(`${header}\n\n`), "");
});

test("resetNotes vide la liste en conservant l'en-tête et le marqueur", () => {
  const reset = resetNotes(`${header}\n\n- ajoute A\n`);
  assert.equal(reset, `${header}\n`);
  assert.equal(extractNotes(reset), "");
});

test("un fichier sans marqueur est refusé plutôt que publié ou vidé", () => {
  assert.throws(() => extractNotes("- ajoute A\n"), /marqueur/);
  assert.throws(() => resetNotes("- ajoute A\n"), /marqueur/);
});
