import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EditablePortfolioTransaction, Position } from "@pea/shared";
import { detectPotentialDuplicateTransaction } from "./importAvisOperes.service.js";
import { applyEditableTransactionPatch, calculateTransactionStats, legacyTransactionFromPosition } from "./portfolioTransactions.service.js";

describe("portfolio transaction helpers", () => {
  const transaction: EditablePortfolioTransaction = {
    id: "1",
    positionId: 10,
    assetId: "10",
    source: "pdf_avis_opere",
    dateExecution: "2026-03-27T15:08:41",
    tradedAt: "2026-03-27T15:08:41",
    ticker: "WPEA.PA",
    type: "buy",
    quantity: 339,
    executedPrice: 5.888,
    price: 5.888,
    commission: 1,
    fees: 2,
    currency: "EUR",
    createdAt: "2026-03-27T15:08:41"
  };

  it("detects potential duplicate transactions", () => {
    assert.equal(
      detectPotentialDuplicateTransaction(
        { id: "parsed", dateExecution: "2026-03-27T15:08:41", quantite: 339, selectedSymbol: "WPEA.PA", sensOperation: "achat", devise: "EUR", warnings: [] },
        [transaction]
      ),
      true
    );
  });

  it("calculates transaction count and total fees", () => {
    const stats = calculateTransactionStats([transaction, { ...transaction, id: "2", totalFees: 4, commission: undefined, fees: undefined }], 12, "EUR");
    assert.equal(stats.transactionCount, 2);
    assert.equal(stats.totalFees, 7);
    assert.equal(stats.totalDividendsReceived, 12);
  });

  it("builds one legacy CSV transaction from a position", () => {
    const position: Position = { id: 3, symbol: "BN.PA", name: "Danone", quantity: 1, averageBuyPrice: 60.58, currency: "EUR", createdAt: "2021-07-08T09:00:16" };
    const legacy = legacyTransactionFromPosition(position);
    assert.equal(legacy.source, "csv");
    assert.equal(legacy.quantity, 1);
    assert.equal(legacy.price, 60.58);
    assert.equal(legacy.totalFees, 0);
  });

  it("applies editable transaction patches", () => {
    const edited = applyEditableTransactionPatch(transaction, { tradedAt: "2026-03-28T10:00:00", quantity: 340, price: 6, totalFees: 5, currency: "EUR" });
    assert.equal(edited.dateExecution, "2026-03-28T10:00:00");
    assert.equal(edited.quantity, 340);
    assert.equal(edited.executedPrice, 6);
    assert.equal(edited.totalFees, 5);
  });
});
