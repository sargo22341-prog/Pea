import type { EditablePortfolioTransaction, PositionTransactionStats, Position } from "@pea/shared";

export function calculateTransactionStats(
  transactions: Array<Pick<EditablePortfolioTransaction, "totalFees">>,
  totalDividendsReceived = 0,
  currency = "EUR"
): PositionTransactionStats {
  return {
    transactionCount: transactions.length,
    totalFees: transactions.reduce((sum, row) => sum + (row.totalFees ?? 0), 0),
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
    totalFees: 0,
    currency: position.currency,
    createdAt: position.createdAt
  };
}
