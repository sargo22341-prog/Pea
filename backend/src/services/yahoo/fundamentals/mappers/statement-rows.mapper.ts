import { DAY_MS, type FinancialStatementRow } from "@pea/shared";
import { statementValuesByEndDate } from "./statements.mapper.js";

/** Quatre trimestres consécutifs couvrent au plus ~9 mois entre la première et la dernière clôture. */
const TTM_MAX_SPAN_DAYS = 300;
const TTM_QUARTERS = 4;
const FLOW_KEYS = ["operatingCashFlow", "freeCashFlow", "capex", "dividendsPaid", "buybacks"] as const;

function first(values: Record<string, number>, ...keys: string[]) {
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Sortie de trésorerie publiée en négatif par Yahoo : ramenée en montant positif. */
function outflow(value: number | undefined) {
  return value === undefined ? undefined : Math.abs(value);
}

function rowFromValues(endDate: string, balance: Record<string, number>, cashFlow: Record<string, number>): FinancialStatementRow {
  const totalDebt = first(balance, "totaldebt");
  const cash = first(balance, "cashandcashequivalents", "cashcashequivalentsandshortterminvestments");
  const reportedNetDebt = first(balance, "netdebt");
  return {
    endDate,
    netDebt: reportedNetDebt ?? (totalDebt !== undefined && cash !== undefined ? totalDebt - cash : undefined),
    totalDebt,
    totalEquity: first(balance, "stockholdersequity", "commonstockequity", "totalequitygrossminorityinterest"),
    cash,
    operatingCashFlow: first(cashFlow, "operatingcashflow"),
    freeCashFlow: first(cashFlow, "freecashflow"),
    capex: outflow(first(cashFlow, "capitalexpenditure", "purchaseofppe")),
    dividendsPaid: outflow(first(cashFlow, "cashdividendspaid", "commonstockdividendpaid")),
    buybacks: outflow(first(cashFlow, "repurchaseofcapitalstock", "commonstockpayments"))
  };
}

function hasData(row: FinancialStatementRow) {
  return Object.entries(row).some(([key, value]) => key !== "endDate" && typeof value === "number");
}

/** Bilan et flux de trésorerie alignés par date de clôture, du plus ancien au plus récent. */
export function statementRowsFromTimeSeries(balanceRaw: unknown, cashFlowRaw: unknown): FinancialStatementRow[] {
  const balance = statementValuesByEndDate(balanceRaw);
  const cashFlow = statementValuesByEndDate(cashFlowRaw);
  const dates = [...new Set([...balance.keys(), ...cashFlow.keys()])].sort();
  return dates.map((date) => rowFromValues(date, balance.get(date) ?? {}, cashFlow.get(date) ?? {})).filter(hasData);
}

/**
 * Ligne « 12 mois glissants » : flux des quatre derniers trimestres additionnés, bilan du
 * dernier trimestre. Absente si les quatre trimestres ne sont pas consécutifs (sociétés qui ne
 * publient que des semestres) ou si un flux manque.
 */
export function trailingTwelveMonthsRow(quarterRows: FinancialStatementRow[]): FinancialStatementRow | undefined {
  const lastQuarters = quarterRows.slice(-TTM_QUARTERS);
  const oldest = lastQuarters[0];
  const latest = lastQuarters.at(-1);
  if (lastQuarters.length < TTM_QUARTERS || !oldest || !latest) return undefined;
  if ((Date.parse(latest.endDate) - Date.parse(oldest.endDate)) / DAY_MS > TTM_MAX_SPAN_DAYS) return undefined;
  const flows: Partial<Record<(typeof FLOW_KEYS)[number], number>> = {};
  for (const key of FLOW_KEYS) {
    const values = lastQuarters.map((row) => row[key]);
    if (values.every((value): value is number => value !== undefined)) flows[key] = values.reduce((sum, value) => sum + value, 0);
  }
  if (!Object.keys(flows).length) return undefined;
  return {
    endDate: latest.endDate,
    isTtm: true,
    netDebt: latest.netDebt,
    totalDebt: latest.totalDebt,
    totalEquity: latest.totalEquity,
    cash: latest.cash,
    ...flows
  };
}
