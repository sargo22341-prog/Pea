/**
 * Role du fichier : rafraichir et lire les donnees financieres annuelles quand
 * Yahoo les expose via fundamentalsTimeSeries. Les champs absents restent null.
 */

import type { FinancialYearItem } from "@pea/shared";
import { db } from "../../../db.js";
import { yahooApi } from "../../yahoo/yahoo.api.js";
import { logger } from "../../shared/logger.service.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";

function safeNumber(value: unknown): number | null {
  if (value && typeof value === "object") {
    const candidate = value as { raw?: unknown; reportedValue?: { raw?: unknown } };
    return safeNumber(candidate.raw ?? candidate.reportedValue?.raw);
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function seriesRows(raw: any): any[] {
  if (Array.isArray(raw)) return raw.flatMap((row) => seriesRows(row));
  if (Array.isArray(raw?.timeseries?.result)) return raw.timeseries.result.flatMap((row: any) => expandTimeSeriesResult(row));
  if (Array.isArray(raw?.result)) return raw.result.flatMap((row: any) => expandTimeSeriesResult(row));
  if (raw && typeof raw === "object") return expandTimeSeriesResult(raw);
  return [];
}

function expandTimeSeriesResult(row: any): any[] {
  const metricKey = Object.keys(row ?? {}).find((key) => key.startsWith("annual") && Array.isArray(row[key]));
  if (!metricKey || !Array.isArray(row?.timestamp)) return [row];
  return row.timestamp.map((timestamp: unknown, index: number) => ({
    date: timestamp,
    [metricKey]: row[metricKey]?.[index]
  }));
}

function rowYear(row: any) {
  const date = row.asOfDate ?? row.endDate ?? row.period ?? row.date;
  const timestamp = typeof date === "number" && date < 10_000_000_000 ? date * 1000 : date;
  const year = date ? new Date(timestamp).getFullYear() : Number(row.fiscalYear);
  return Number.isInteger(year) ? year : undefined;
}

export class FinancialsService {
  async refreshFinancials(asset: AssetRow | string) {
    const assetRow = typeof asset === "string" ? assetRepository.findBySymbol(asset) : asset;
    if (!assetRow) return { updated: 0 };

    let raw: any;
    try {
      raw = await yahooApi.fundamentalsTimeSeries(assetRow.symbol);
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
      db.prepare(
        `INSERT INTO asset_financials (asset_id, fiscal_year, period, total_revenue, net_income, gross_profit, operating_income, ebitda, net_margin, currency, source)
         VALUES (?, ?, 'annual', ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2')
         ON CONFLICT(asset_id, fiscal_year, period) DO UPDATE SET
           total_revenue = excluded.total_revenue,
           net_income = excluded.net_income,
           gross_profit = excluded.gross_profit,
           operating_income = excluded.operating_income,
           ebitda = excluded.ebitda,
           net_margin = excluded.net_margin,
           currency = excluded.currency,
           source = excluded.source,
           updated_at = CURRENT_TIMESTAMP`
      ).run(assetRow.id, year, totalRevenue, netIncome, values.grossProfit ?? null, values.operatingIncome ?? null, values.ebitda ?? null, netMargin, assetRow.currency ?? null);
    }

    return { updated: byYear.size };
  }

  async refreshAllTracked() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      let asset = assetRepository.findBySymbol(symbol);
      if (!asset) asset = assetRepository.upsertFromQuote((await yahooApi.quote(symbol)).snapshot);
      updated += (await this.refreshFinancials(asset)).updated;
    }
    return { updated };
  }

  readFinancialRows(symbol: string): FinancialYearItem[] {
    const asset = assetRepository.findBySymbol(symbol);
    if (!asset) return [];
    const rows = db
      .prepare("SELECT fiscal_year, total_revenue, net_income, net_margin FROM asset_financials WHERE asset_id = ? AND period = 'annual' ORDER BY fiscal_year ASC")
      .all(asset.id) as Array<{ fiscal_year: number; total_revenue: number | null; net_income: number | null; net_margin: number | null }>;
    return rows
      .filter((row) => row.total_revenue != null && row.net_income != null && row.net_margin != null)
      .map((row) => ({
        year: Number(row.fiscal_year),
        revenue: Number(row.total_revenue),
        netIncome: Number(row.net_income),
        netMargin: Number(row.net_margin)
      }));
  }
}

export const financialsService = new FinancialsService();
