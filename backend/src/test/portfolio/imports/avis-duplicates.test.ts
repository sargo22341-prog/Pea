import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedAvisOperation } from "@pea/shared";
import { isDuplicateOfExistingTransaction, markDuplicatesWithinBatch } from "../../../services/boursorama/avis-duplicates.js";

function operation(overrides: Partial<ParsedAvisOperation> = {}): ParsedAvisOperation {
  return {
    id: "op-1",
    dateExecution: "2026-01-10T00:30:00",
    quantite: 5,
    sensOperation: "achat",
    devise: "EUR",
    warnings: [],
    selectedSymbol: "AI.PA",
    ...overrides
  };
}

test("a PDF operation matching a manual transaction of the position is a duplicate", () => {
  // 00:30 à Paris le 10 janvier est stocké le 9 janvier en UTC.
  const manual = [{ tradedAt: "2026-01-09T23:30:00.000Z", quantity: 5, type: "buy" as const }];
  assert.equal(isDuplicateOfExistingTransaction(operation(), manual, "Europe/Paris"), true);
  assert.equal(isDuplicateOfExistingTransaction(operation({ quantite: 6 }), manual, "Europe/Paris"), false);
  assert.equal(isDuplicateOfExistingTransaction(operation({ sensOperation: "vente" }), manual, "Europe/Paris"), false);
  assert.equal(isDuplicateOfExistingTransaction(operation({ dateExecution: "2026-01-11T00:30:00" }), manual, "Europe/Paris"), false);
});

test("the same operation sent twice in one import is flagged once", () => {
  const rows = markDuplicatesWithinBatch([operation({ id: "a" }), operation({ id: "b" }), operation({ id: "c", selectedSymbol: "MC.PA" })]);
  assert.deepEqual(rows.map((row) => Boolean(row.potentialDuplicate)), [false, true, false]);
  assert.deepEqual(rows[1]?.warnings, ["Doublon possible."]);
});
