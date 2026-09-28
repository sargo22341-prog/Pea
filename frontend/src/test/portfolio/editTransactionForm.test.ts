import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { maxSellQuantity, toFormRow } from "../../pages/asset-detail/components/editTransactionForm";

function transaction(overrides: Partial<EditablePortfolioTransaction>): EditablePortfolioTransaction {
  return {
    id: "1",
    positionId: 1,
    assetId: "1",
    source: "manual",
    tradedAt: "2024-01-15T10:00:00.000Z",
    type: "sell",
    quantity: 2,
    price: 1000,
    currency: "EUR",
    createdAt: "2024-01-15T10:00:00.000Z",
    ...overrides
  };
}

const position = { id: 1, quantity: 80 } as PositionWithMarket;

describe("sell limit of an edited transaction", () => {
  it("excludes the saved effect of the edited sale", () => {
    expect(maxSellQuantity(toFormRow(transaction({})), position)).toBe(82);
  });

  it("stays in the row's own units when a stock split was applied", () => {
    // Vente de 2 titres avant une division 1 -> 10 : elle pèse 20 titres dans la position ajustée (80).
    const row = toFormRow(transaction({ splitFactor: 10 }));

    expect(row.savedQuantityEffect).toBe(-20);
    expect(maxSellQuantity(row, position)).toBe(10);
  });
});
