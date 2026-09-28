/** Compte de résultat annuel simplifié (module Yahoo `fundamentalsTimeSeries`, `financials`). */
export interface FinancialYearItem {
  year: number;
  revenue: number;
  netIncome: number;
  netMargin: number;
}

export type StatementsPeriod = "annual" | "quarterly";

/**
 * Bilan et flux de trésorerie d'une période (modules `balance-sheet` et `cash-flow`).
 * Les sorties de trésorerie (investissements, dividendes, rachats) sont des montants positifs.
 */
export interface FinancialStatementRow {
  /** Date de clôture de la période (ISO). */
  endDate: string;
  /** Ligne « 12 mois glissants » calculée à partir des quatre derniers trimestres. */
  isTtm?: boolean | undefined;
  netDebt?: number | undefined;
  totalDebt?: number | undefined;
  totalEquity?: number | undefined;
  cash?: number | undefined;
  operatingCashFlow?: number | undefined;
  freeCashFlow?: number | undefined;
  capex?: number | undefined;
  dividendsPaid?: number | undefined;
  buybacks?: number | undefined;
}

export interface AssetFinancialStatements {
  symbol: string;
  period: StatementsPeriod;
  currency?: string | undefined;
  rows: FinancialStatementRow[];
}
