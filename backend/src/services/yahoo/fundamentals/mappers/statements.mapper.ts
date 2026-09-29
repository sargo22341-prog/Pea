import type { FinancialYearItem } from "@pea/shared";
import { rawArray, rawRecord, type YahooRawRecord } from "../../yahoo.raw.js";
import { rawDate, rawNumber } from "../../utils/raw-values.js";

/** Nombre d'exercices conservés pour le graphique chiffre d'affaires / résultat. */
const FINANCIAL_YEARS_LIMIT = 5;
/** Au-dessous, un timestamp numérique est exprimé en secondes et non en millisecondes. */
const SECONDS_TIMESTAMP_LIMIT = 10_000_000_000;
const ANNUAL_PREFIX = "annual";
/** Colonnes descriptives des lignes `fundamentalsTimeSeries`, qui ne sont pas des indicateurs. */
const NON_METRIC_KEYS = new Set(["type", "date", "periodtype", "asofdate", "enddate", "period", "fiscalyear", "timestamp", "currencycode"]);

/** Valeurs annuelles indexées par exercice, avec des noms d'indicateurs en minuscules sans préfixe `annual`. */
export type AnnualStatementValues = Map<number, Record<string, number>>;

/**
 * Accepte la réponse actuelle de yahoo-finance2 (une ligne par période), les formes brutes
 * historiques (`timeseries.result`, séries `annualX` + `timestamp`) et une ligne isolée.
 */
function timeSeriesRows(raw: unknown): YahooRawRecord[] {
  if (Array.isArray(raw)) return raw.flatMap((row) => timeSeriesRows(row));
  const record = rawRecord(raw);
  const timeseries = rawRecord(record["timeseries"]);
  if (Array.isArray(timeseries["result"])) return rawArray<unknown>(timeseries["result"]).flatMap((row) => expandTimeSeriesResult(row));
  if (Array.isArray(record["result"])) return rawArray<unknown>(record["result"]).flatMap((row) => expandTimeSeriesResult(row));
  if (raw && typeof raw === "object") return expandTimeSeriesResult(raw);
  return [];
}

function expandTimeSeriesResult(row: unknown): YahooRawRecord[] {
  const record = rawRecord(row);
  const metricKey = Object.keys(record).find((key) => key.startsWith(ANNUAL_PREFIX) && Array.isArray(record[key]));
  const timestamps = rawArray<unknown>(record["timestamp"]);
  if (!metricKey || !timestamps.length) return [record];
  const metricRows = rawArray<unknown>(record[metricKey]);
  return timestamps.map((timestamp, index) => ({ date: timestamp, [metricKey]: metricRows[index] }));
}

function rowYear(row: YahooRawRecord) {
  const date = row["asOfDate"] ?? row["endDate"] ?? row["period"] ?? row["date"];
  const timestamp = typeof date === "number" && date < SECONDS_TIMESTAMP_LIMIT ? date * 1000 : date;
  const year = date && (typeof timestamp === "string" || typeof timestamp === "number" || timestamp instanceof Date)
    ? new Date(timestamp).getUTCFullYear()
    : Number(row["fiscalYear"]);
  return Number.isInteger(year) ? year : undefined;
}

function metricName(key: string) {
  const withoutPrefix = key.startsWith(ANNUAL_PREFIX) && key.length > ANNUAL_PREFIX.length ? key.slice(ANNUAL_PREFIX.length) : key;
  return withoutPrefix.toLowerCase();
}

function metricValue(value: unknown) {
  const reported = rawRecord(value)["reportedValue"];
  return rawNumber(reported ?? value);
}

function rowEndDate(row: YahooRawRecord) {
  return rawDate(row["asOfDate"] ?? row["endDate"] ?? row["date"]);
}

/** Regroupe toutes les valeurs numériques d'une série selon la clé de période fournie. */
function groupStatementValues<K>(raw: unknown, periodOf: (row: YahooRawRecord) => K | undefined): Map<K, Record<string, number>> {
  const byPeriod = new Map<K, Record<string, number>>();
  for (const row of timeSeriesRows(raw)) {
    const period = periodOf(row);
    if (period === undefined) continue;
    const bucket = byPeriod.get(period) ?? {};
    for (const [key, value] of Object.entries(row)) {
      const name = metricName(key);
      if (NON_METRIC_KEYS.has(name)) continue;
      const numberValue = metricValue(value);
      if (numberValue !== undefined) bucket[name] = numberValue;
    }
    byPeriod.set(period, bucket);
  }
  return byPeriod;
}

/** Valeurs d'une série annuelle par exercice. */
export function annualStatementValues(raw: unknown): AnnualStatementValues {
  return groupStatementValues(raw, rowYear);
}

/** Valeurs d'une série (annuelle ou trimestrielle) par date de clôture ISO. */
export function statementValuesByEndDate(raw: unknown): Map<string, Record<string, number>> {
  return groupStatementValues(raw, rowEndDate);
}

/** Chiffre d'affaires, résultat net et marge nette des derniers exercices complets. */
export function financialRowsFromTimeSeries(raw: unknown): FinancialYearItem[] {
  return [...annualStatementValues(raw).entries()]
    .flatMap(([year, values]): FinancialYearItem[] => {
      const revenue = values["totalrevenue"];
      const netIncome = values["netincome"];
      if (revenue === undefined || netIncome === undefined || revenue === 0) return [];
      return [{ year, revenue, netIncome, netMargin: (netIncome / revenue) * 100 }];
    })
    .sort((a, b) => a.year - b.year)
    .slice(-FINANCIAL_YEARS_LIMIT);
}
