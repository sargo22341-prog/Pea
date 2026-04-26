import type { EditablePortfolioTransaction, PositionTransactionStats, Position } from "@pea/shared";

export function calculateTransactionStats(
  transactions: Array<Pick<EditablePortfolioTransaction, "totalFees" | "commission" | "fees">>,
  totalDividendsReceived = 0,
  currency = "EUR"
): PositionTransactionStats {
  return {
    transactionCount: transactions.length,
    totalFees: transactions.reduce((sum, row) => sum + (row.totalFees ?? ((row.commission ?? 0) + (row.fees ?? 0))), 0),
    totalDividendsReceived,
    currency
  };
}

export function legacyTransactionFromPosition(position: Position): EditablePortfolioTransaction {
  return {
    id: `legacy-${position.id}`,
    positionId: position.id,
    assetId: String(position.id),
    source: "csv",
    dateExecution: position.createdAt,
    tradedAt: position.createdAt,
    assetName: position.name,
    ticker: position.symbol,
    type: "buy",
    quantity: position.quantity,
    executedPrice: position.averageBuyPrice,
    price: position.averageBuyPrice,
    fees: 0,
    totalFees: 0,
    currency: position.currency,
    createdAt: position.createdAt
  };
}

export function applyEditableTransactionPatch(
  transaction: EditablePortfolioTransaction,
  patch: Partial<Pick<EditablePortfolioTransaction, "tradedAt" | "quantity" | "price" | "fees" | "totalFees" | "currency">>
): EditablePortfolioTransaction {
  return {
    ...transaction,
    ...patch,
    dateExecution: patch.tradedAt ?? transaction.dateExecution,
    executedPrice: patch.price ?? transaction.executedPrice
  };
}
