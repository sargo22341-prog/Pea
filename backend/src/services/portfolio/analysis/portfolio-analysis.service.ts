import type { AssetFinancials, AllocationChartItem, NetMarginItem, PortfolioAnalysis, PortfolioTreemapItem, PositionWithMarket } from "@pea/shared";
import { config } from "../../../config.js";
import { requireUserId } from "../../auth/user-context.js";
import { chartConfigService } from "../../market/charts/chart-config.service.js";
import { marketDataGateway } from "../../market/data/market-data-gateway.service.js";
import { frontendBlockCache } from "../../shared/frontend-block-cache.service.js";
import { logger } from "../../shared/logger.service.js";
import { isMarketDataUnavailable } from "../../yahoo/index.js";
import { portfolioService } from "../portfolio.service.js";
import { SECTOR_EXPOSURE_VERSION, addAllocation, aggregateFinancials, annualFinancialRows, finalizeAllocation, getCountry, getLogo, getPositionSectorExposure, getSector, isEtf, latestNetMargin, persistedFundamentals, safeText, type Fundamentals } from "./portfolio-analysis.helpers.js";

export { getPositionSectorExposure } from "./portfolio-analysis.helpers.js";

export class PortfolioAnalysisService {
  financialRows(fundamentals?: Fundamentals) {
    return annualFinancialRows(fundamentals);
  }

  isEtfFundamentals(quote: Pick<PositionWithMarket, "quote">, fundamentals?: Fundamentals) {
    return isEtf(quote, fundamentals);
  }

  async assetFinancials(symbol: string, name?: string): Promise<AssetFinancials> {
    const result = await marketDataGateway.readFundamentalsWithCache(symbol);
    const quote = {
      quote: {
        symbol: symbol.toUpperCase(),
        name: name ?? symbol.toUpperCase(),
        price: 0,
        currency: "EUR",
        quoteType: safeText(result.data?.quoteType?.quoteType)
      }
    };
    const etf = isEtf(quote, result.data);
    return {
      symbol: symbol.toUpperCase(),
      name: name ?? symbol.toUpperCase(),
      logoUrl: safeText(result.data?.price?.logoUrl),
      quoteType: safeText(result.data?.quoteType?.quoteType),
      isEtf: etf,
      financials: etf ? [] : annualFinancialRows(result.data)
    };
  }

  async analysis(userId?: number | string): Promise<PortfolioAnalysis> {
    const resolvedUserId = requireUserId(userId);
    const cacheUserId = String(resolvedUserId);
    if (config.enableMarketLiveRefresh) {
      const cached = frontendBlockCache.read<PortfolioAnalysis>(cacheUserId, "analysis");
      if (cached?.sectorExposureVersion === SECTOR_EXPOSURE_VERSION) return cached;
    }
    const portfolio = await portfolioService.summary("1d", resolvedUserId);
    const totalValue = portfolio.totalValue || portfolio.positions.reduce((sum, position) => sum + position.marketValue, 0);
    if (!portfolio.positions.length || !totalValue) {
      const empty = { countryAllocation: [], sectorAllocation: [], treemap: [], netMargins: [], financials: [], financialsByAsset: [], sectorExposureVersion: SECTOR_EXPOSURE_VERSION };
      if (config.enableMarketLiveRefresh) frontendBlockCache.write(cacheUserId, "analysis", empty, chartConfigService.getSnapshotRefreshIntervalMs());
      return empty;
    }

    const fundamentalResults = await Promise.all(
      portfolio.positions.map(async (position) => {
        if (config.enableMarketLiveRefresh) {
          return { position, result: { data: persistedFundamentals(position.symbol), stale: false } };
        }
        try {
          return { position, result: await marketDataGateway.readFundamentalsWithCache(position.symbol) };
        } catch (error) {
          if (!isMarketDataUnavailable(error)) {
            logger.warn("portfolio", "fundamentals fallback", {
              symbol: position.symbol,
              error: error instanceof Error ? error.message : String(error)
            });
          }
          return { position, result: undefined };
        }
      })
    );

    const countryAllocation = new Map<string, AllocationChartItem>();
    const sectorAllocation = new Map<string, AllocationChartItem>();
    const treemap: PortfolioTreemapItem[] = [];
    const netMargins: NetMarginItem[] = [];
    const financialsByAsset: AssetFinancials[] = [];
    const financialInputs: Array<{ weight: number; fundamentals?: Fundamentals; etf: boolean }> = [];
    let stale = portfolio.positions.some((position) => position.marketDataUnavailable || position.quote?.stale);

    for (const { position, result } of fundamentalResults) {
      const fundamentals = result?.data;
      stale = stale || Boolean(result?.stale);
      const weight = (position.marketValue / totalValue) * 100;
      const etf = isEtf(position, fundamentals);
      const logoUrl = getLogo(position, fundamentals);
      const country = getCountry(position, fundamentals);
      const sector = getSector(position, fundamentals);

      addAllocation(countryAllocation, country, position, weight, logoUrl);
      for (const sectorExposure of getPositionSectorExposure(position, fundamentals, weight)) {
        addAllocation(sectorAllocation, sectorExposure.sector, position, sectorExposure.weight, logoUrl);
      }
      treemap.push({ symbol: position.symbol, name: position.name, value: weight, percentage: weight, logoUrl, country, sector });
      financialInputs.push({ weight: weight / 100, fundamentals, etf });

      if (!etf) {
        const rows = annualFinancialRows(fundamentals);
        if (rows.length) {
          financialsByAsset.push({
            symbol: position.symbol,
            name: position.name,
            logoUrl,
            quoteType: position.quote?.quoteType,
            isEtf: false,
            financials: rows
          });
        }
        const netMargin = latestNetMargin(fundamentals);
        if (netMargin !== undefined) netMargins.push({ symbol: position.symbol, name: position.name, netMargin, logoUrl });
      }
    }

    const payload = {
      countryAllocation: finalizeAllocation(countryAllocation),
      sectorAllocation: finalizeAllocation(sectorAllocation),
      treemap: treemap.sort((a, b) => b.value - a.value),
      netMargins: netMargins.sort((a, b) => b.netMargin - a.netMargin),
      financialsByAsset: financialsByAsset.sort((a, b) => a.name.localeCompare(b.name)),
      financials: aggregateFinancials(financialInputs),
      stale,
      sectorExposureVersion: SECTOR_EXPOSURE_VERSION
    };
    if (config.enableMarketLiveRefresh) frontendBlockCache.write(cacheUserId, "analysis", payload, chartConfigService.getSnapshotRefreshIntervalMs());
    return payload;
  }
}

export const portfolioAnalysisService = new PortfolioAnalysisService();
