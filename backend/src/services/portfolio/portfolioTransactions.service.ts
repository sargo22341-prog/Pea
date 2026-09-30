import type { EditablePortfolioTransaction, PositionTransactionStats } from "@pea/shared";

export function calculateTransactionStats(
  transactions: Pick<EditablePortfolioTransaction, "totalFees">[],
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
