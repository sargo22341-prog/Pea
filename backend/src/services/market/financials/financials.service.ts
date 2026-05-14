import type { FinancialYearItem } from "@pea/shared";
import { logger } from "../../shared/logger.service.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { financialsRepository } from "../../../repositories/market/financials.repository.js";
import { marketDataGateway } from "../data/market-data-gateway.service.js";

type RawRecord = Record<string, unknown>;

function safeNumber(value: unknown): number | null {
  if (value && typeof value === "object") {
    const candidate = value as { raw?: unknown; reportedValue?: { raw?: unknown } };
    return safeNumber(candidate.raw ?? candidate.reportedValue?.raw);
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function rawRecord(value: unknown): RawRecord | undefined {
  return value && typeof value === "object" ? value as RawRecord : undefined;
}

function rawArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function seriesRows(raw: unknown): RawRecord[] {
  if (Array.isArray(raw)) return raw.flatMap((row) => seriesRows(row));
  const record = rawRecord(raw);
  if (record) {
    const timeseries = rawRecord(record.timeseries);
    const timeseriesResult = rawArray(timeseries?.result);
    if (timeseriesResult.length) return timeseriesResult.flatMap((row) => expandTimeSeriesResult(row));
    const result = rawArray(record.result);
    if (result.length) return result.flatMap((row) => expandTimeSeriesResult(row));
    return expandTimeSeriesResult(record);
  }
  return [];
}

function expandTimeSeriesResult(row: unknown): RawRecord[] {
  const record = rawRecord(row);
  if (!record) return [];
  const metricKey = Object.keys(record).find((key) => key.startsWith("annual") && Array.isArray(record[key]));
  const timestamps = rawArray(record.timestamp);
  if (!metricKey || !timestamps.length) return [record];
  const values = rawArray(record[metricKey]);
  return timestamps.map((timestamp: unknown, index: number) => ({
    date: timestamp,
    [metricKey]: values[index]
  }));
}

function rowYear(row: RawRecord) {
  const date = row.asOfDate ?? row.endDate ?? row.period ?? row.date;
  const timestamp = typeof date === "number" && date < 10_000_000_000 ? date * 1000 : date;
  const year = date && (typeof timestamp === "string" || typeof timestamp === "number" || timestamp instanceof Date) ? new Date(timestamp).getFullYear() : Number(row.fiscalYear);
  return Number.isInteger(year) ? year : undefined;
}

export class FinancialsService {
  async refreshFinancials(asset: AssetRow | string) {
    const assetRow = typeof asset === "string" ? assetRepository.findBySymbol(asset) : asset;
    if (!assetRow) return { updated: 0 };

    let raw: unknown;
    try {
      raw = await marketDataGateway.fetchFreshFundamentalsTimeSeries(assetRow.symbol);
    } catch (error) {
      logger.warn("market-data", "Yahoo fundamentalsTimeSeries failed", { symbol: assetRow.symbol, error: error instanceof Error ? error.message : String(error) });
      return { updated: 0 };
    }

    const byYear = new Map<number, Record<string, number | null>>();
    for (const row of seriesRows(raw)) {
      const year = rowYear(row);
      if (!year) continue;
      const bucket = byYear.get(year) ?? {};
      bucket.totalRevenue = safeNumber(row.annualTotalRevenue ?? row.totalRevenue ?? bucket.totalRevenue);
      bucket.netIncome = safeNumber(row.annualNetIncome ?? row.netIncome ?? bucket.netIncome);
      bucket.grossProfit = safeNumber(row.annualGrossProfit ?? row.grossProfit ?? bucket.grossProfit);
      bucket.operatingIncome = safeNumber(row.annualOperatingIncome ?? row.operatingIncome ?? bucket.operatingIncome);
      bucket.ebitda = safeNumber(row.annualEbitda ?? row.ebitda ?? bucket.ebitda);
      byYear.set(year, bucket);
    }

    for (const [year, values] of byYear) {
      const totalRevenue = values.totalRevenue ?? null;
      const netIncome = values.netIncome ?? null;
      const netMargin = totalRevenue && netIncome != null ? (netIncome / totalRevenue) * 100 : null;
      financialsRepository.upsertAnnual(assetRow.id, year, {
        totalRevenue,
        netIncome,
        grossProfit: values.grossProfit ?? null,
        operatingIncome: values.operatingIncome ?? null,
        ebitda: values.ebitda ?? null,
        netMargin
      }, assetRow.currency ?? null);
    }

    return { updated: byYear.size };
  }

  async refreshAllTracked() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      let asset = assetRepository.findBySymbol(symbol);
      if (!asset) asset = assetRepository.upsertFromQuote((await marketDataGateway.fetchFreshQuote(symbol)).snapshot);
      updated += (await this.refreshFinancials(asset)).updated;
    }
    return { updated };
  }

  readFinancialRows(symbol: string): FinancialYearItem[] {
    const asset = assetRepository.findBySymbol(symbol);
    if (!asset) return [];
    return financialsRepository.readAnnualRows(asset.id);
  }
}

export const financialsService = new FinancialsService();
