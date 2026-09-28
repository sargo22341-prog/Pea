import type { FinancialStatementRow, StatementsPeriod } from "@pea/shared";
import type { TFunction } from "i18next";

export type StatementsView = "results" | "balance" | "flows";
export type StatementMetric = Exclude<keyof FinancialStatementRow, "endDate" | "isTtm">;

export interface StatementSeries {
  key: StatementMetric;
  kind: "bar" | "line";
  color: string;
}

/** Séries tracées pour chaque vue : dette nette face aux capitaux propres, FCF face aux dividendes. */
export const STATEMENT_SERIES: Record<Exclude<StatementsView, "results">, StatementSeries[]> = {
  balance: [
    { key: "netDebt", kind: "bar", color: "#fb7185" },
    { key: "totalEquity", kind: "bar", color: "#38bdf8" },
    { key: "cash", kind: "line", color: "#4ade80" }
  ],
  flows: [
    { key: "freeCashFlow", kind: "bar", color: "#4ade80" },
    { key: "dividendsPaid", kind: "bar", color: "#fbbf24" }
  ]
};

/** Lignes du tableau chiffré, dans l'ordre de lecture d'un bilan puis d'un tableau de flux. */
export const STATEMENT_TABLE_METRICS: readonly StatementMetric[] = [
  "netDebt",
  "totalDebt",
  "totalEquity",
  "cash",
  "operatingCashFlow",
  "freeCashFlow",
  "capex",
  "dividendsPaid",
  "buybacks"
];

const MONTHS_PER_QUARTER = 3;

/** « 2025 » en annuel, « T2 2026 » en trimestriel, « 12 mois glissants » pour la ligne TTM. */
export function statementPeriodLabel(row: FinancialStatementRow, period: StatementsPeriod, t: TFunction<"asset">) {
  if (row.isTtm) return t("statements.ttm");
  const date = new Date(row.endDate);
  if (!Number.isFinite(date.getTime())) return row.endDate;
  if (period === "annual") return String(date.getUTCFullYear());
  return t("statements.quarter", { quarter: Math.floor(date.getUTCMonth() / MONTHS_PER_QUARTER) + 1, year: date.getUTCFullYear() });
}

export function hasSeriesData(rows: FinancialStatementRow[], series: StatementSeries[]) {
  return rows.some((row) => series.some((item) => row[item.key] !== undefined));
}
