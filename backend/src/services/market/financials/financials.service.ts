import type { FinancialYearItem } from "@pea/shared";
import { logger } from "../../shared/logger.service.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { financialsRepository } from "../../../repositories/market/financials.repository.js";
import { marketDataGateway } from "../data/market-data-gateway.service.js";
import { annualStatementValues } from "../../yahoo/fundamentals/mappers/statements.mapper.js";

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

    const byYear = annualStatementValues(raw);
    for (const [year, values] of byYear) {
      const totalRevenue = values["totalrevenue"] ?? null;
      const netIncome = values["netincome"] ?? null;
      const netMargin = totalRevenue && netIncome != null ? (netIncome / totalRevenue) * 100 : null;
      financialsRepository.upsertAnnual(assetRow.id, year, {
        totalRevenue,
        netIncome,
        grossProfit: values["grossprofit"] ?? null,
        operatingIncome: values["operatingincome"] ?? null,
        ebitda: values["ebitda"] ?? null,
        netMargin
      }, assetRow.currency ?? null);
    }

    return { updated: byYear.size };
  }

  async refreshAllTracked() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      let asset = assetRepository.findBySymbol(symbol);
      asset ??= assetRepository.upsertFromQuote((await marketDataGateway.fetchFreshQuote(symbol)).snapshot);
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
