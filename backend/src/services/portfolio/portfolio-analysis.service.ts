/**
 * Role du fichier : produire les analyses de portefeuille, allocations,
 * treemap et donnees financieres agregees.
 */

import type {
  AssetFinancials,
  AllocationChartItem,
  FinancialYearItem,
  NetMarginItem,
  PortfolioAnalysis,
  PortfolioTreemapItem,
  PositionWithMarket
} from "@pea/shared";
import { logger } from "../shared/logger.service.js";
import { isMarketDataUnavailable, yahooService } from "../yahoo/index.js";
import { portfolioService } from "./portfolio.service.js";

type Fundamentals = Awaited<ReturnType<typeof yahooService.fundamentals>>["data"];

const UNKNOWN = "Unknown";
const ETF_DIVERSIFIED = "ETF / Diversified";

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeNumber(value: unknown) {
  if (value && typeof value === "object") {
    const candidate = value as { raw?: unknown; reportedValue?: { raw?: unknown } };
    return safeNumber(candidate.raw ?? candidate.reportedValue?.raw);
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function safeYear(value: unknown) {
  const candidate = value && typeof value === "object" && "raw" in value ? (value as { raw?: unknown }).raw : value;
  const timestamp = typeof candidate === "number" && candidate < 10_000_000_000 ? candidate * 1000 : candidate;
  const year = candidate ? new Date(timestamp as any).getFullYear() : undefined;
  return Number.isInteger(year) ? year : undefined;
}

function isEtf(position: Pick<PositionWithMarket, "quote">, fundamentals?: Fundamentals) {
  const quoteType = String(position.quote?.quoteType ?? fundamentals?.quoteType?.quoteType ?? "").toUpperCase();
  const typeDisp = String(fundamentals?.quoteType?.typeDisp ?? "").toUpperCase();
  const fundFamily = safeText(fundamentals?.fundProfile?.family);
  return quoteType.includes("ETF") || typeDisp.includes("ETF") || Boolean(fundFamily);
}

function getLogo(position: PositionWithMarket, fundamentals?: Fundamentals) {
  return position.quote?.logoUrl ?? safeText(fundamentals?.price?.logoUrl);
}

function getCountry(position: PositionWithMarket, fundamentals?: Fundamentals) {
  if (isEtf(position, fundamentals)) return ETF_DIVERSIFIED;
  return safeText(fundamentals?.assetProfile?.country) ?? UNKNOWN;
}

function getSector(position: PositionWithMarket, fundamentals?: Fundamentals) {
  if (isEtf(position, fundamentals)) {
    const sectorWeighting = fundamentals?.topHoldings?.sectorWeightings?.[0];
    if (sectorWeighting) {
      const [topSector] = Object.entries(sectorWeighting)
        .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
        .sort(([, a], [, b]) => Number(b) - Number(a));
      if (topSector) return formatSectorKey(topSector[0]);
    }
    return ETF_DIVERSIFIED;
  }
  return safeText(fundamentals?.assetProfile?.sectorDisp) ?? safeText(fundamentals?.assetProfile?.sector) ?? UNKNOWN;
}

function formatSectorKey(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function addAllocation(
  allocations: Map<string, AllocationChartItem>,
  key: string,
  position: PositionWithMarket,
  weight: number,
  logoUrl?: string
) {
  const item = allocations.get(key) ?? { name: key, value: 0, percentage: 0, symbols: [] };
  item.value += weight;
  item.symbols.push({ symbol: position.symbol, name: position.name, weight, logoUrl });
  allocations.set(key, item);
}

function finalizeAllocation(allocations: Map<string, AllocationChartItem>) {
  return [...allocations.values()]
    .map((item) => ({ ...item, percentage: item.value }))
    .sort((a, b) => b.value - a.value);
}

function annualFinancialRows(fundamentals?: Fundamentals): FinancialYearItem[] {
  if (Array.isArray(fundamentals?.annualFinancials)) {
    return fundamentals.annualFinancials
      .filter(
        (row: FinancialYearItem) =>
          Number.isInteger(row.year) && Number.isFinite(row.revenue) && Number.isFinite(row.netIncome) && Number.isFinite(row.netMargin)
      )
      .sort((a: FinancialYearItem, b: FinancialYearItem) => a.year - b.year)
      .slice(-5);
  }

  const rows = fundamentals?.incomeStatementHistory?.incomeStatementHistory ?? [];
  return rows
    .map((row: any) => {
      const revenue = safeNumber(row.totalRevenue);
      const netIncome = safeNumber(row.netIncome);
      const year = safeYear(row.endDate);
      if (!year || revenue === undefined || netIncome === undefined || revenue === 0) return undefined;
      return {
        year,
        revenue,
        netIncome,
        netMargin: (netIncome / revenue) * 100
      };
    })
    .filter((row: FinancialYearItem | undefined): row is FinancialYearItem => Boolean(row))
    .sort((a: FinancialYearItem, b: FinancialYearItem) => a.year - b.year)
    .slice(-5);
}

function latestNetMargin(fundamentals?: Fundamentals) {
  const rows = annualFinancialRows(fundamentals);
  const latest = rows[rows.length - 1];
  if (latest) return latest.netMargin;
  const profitMargins = safeNumber(fundamentals?.financialData?.profitMargins);
  return profitMargins === undefined ? undefined : profitMargins * 100;
}

function aggregateFinancials(items: Array<{ weight: number; fundamentals?: Fundamentals; etf: boolean }>) {
  const byYear = new Map<number, { revenue: number; netIncome: number }>();

  for (const item of items) {
    if (item.etf) continue;
    for (const row of annualFinancialRows(item.fundamentals)) {
      const bucket = byYear.get(row.year) ?? { revenue: 0, netIncome: 0 };
      bucket.revenue += row.revenue * item.weight;
      bucket.netIncome += row.netIncome * item.weight;
      byYear.set(row.year, bucket);
    }
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .slice(-5)
    .map<FinancialYearItem>(([year, values]) => ({
      year,
      revenue: values.revenue,
      netIncome: values.netIncome,
      netMargin: values.revenue ? (values.netIncome / values.revenue) * 100 : 0
    }));
}

export class PortfolioAnalysisService {
  financialRows(fundamentals?: Fundamentals) {
    return annualFinancialRows(fundamentals);
  }

  isEtfFundamentals(quote: Pick<PositionWithMarket, "quote">, fundamentals?: Fundamentals) {
    return isEtf(quote, fundamentals);
  }

  async assetFinancials(symbol: string, name?: string): Promise<AssetFinancials> {
    const result = await yahooService.fundamentals(symbol);
    const quote = {
      quote: {
        symbol: symbol.toUpperCase(),
        name: name ?? symbol.toUpperCase(),
        price: 0,
        currency: "EUR",
        quoteType: result.data?.quoteType?.quoteType
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

  async analysis(): Promise<PortfolioAnalysis> {
    const portfolio = await portfolioService.summary("1d");
    const totalValue = portfolio.totalValue || portfolio.positions.reduce((sum, position) => sum + position.marketValue, 0);
    if (!portfolio.positions.length || !totalValue) {
      return { countryAllocation: [], sectorAllocation: [], treemap: [], netMargins: [], financials: [], financialsByAsset: [] };
    }

    const fundamentalResults = await Promise.all(
      portfolio.positions.map(async (position) => {
        try {
          return { position, result: await yahooService.fundamentals(position.symbol) };
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
      addAllocation(sectorAllocation, sector, position, weight, logoUrl);
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

    return {
      countryAllocation: finalizeAllocation(countryAllocation),
      sectorAllocation: finalizeAllocation(sectorAllocation),
      treemap: treemap.sort((a, b) => b.value - a.value),
      netMargins: netMargins.sort((a, b) => b.netMargin - a.netMargin),
      financialsByAsset: financialsByAsset.sort((a, b) => a.name.localeCompare(b.name)),
      financials: aggregateFinancials(financialInputs),
      stale
    };
  }
}

export const portfolioAnalysisService = new PortfolioAnalysisService();
