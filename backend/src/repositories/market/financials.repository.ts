import type { FinancialYearItem } from "@pea/shared";
import { db } from "../../db.js";

export interface FinancialValues {
  totalRevenue: number | null;
  netIncome: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  netMargin: number | null;
}

export class FinancialsRepository {
  upsertAnnual(assetId: number, year: number, values: FinancialValues, currency?: string | null) {
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
    ).run(assetId, year, values.totalRevenue, values.netIncome, values.grossProfit, values.operatingIncome, values.ebitda, values.netMargin, currency ?? null);
  }

  readAnnualRows(assetId: number): FinancialYearItem[] {
    const rows = db
      .prepare("SELECT fiscal_year, total_revenue, net_income, net_margin FROM asset_financials WHERE asset_id = ? AND period = 'annual' ORDER BY fiscal_year ASC")
      .all(assetId) as Array<{ fiscal_year: number; total_revenue: number | null; net_income: number | null; net_margin: number | null }>;
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

export const financialsRepository = new FinancialsRepository();
