import type {
  AssetFinancials,
  AllocationChartItem,
  FinancialYearItem,
  NetMarginItem,
  PortfolioAnalysis,
  PortfolioTreemapItem,
  PositionWithMarket
} from "@pea/shared";
import { config } from "../../config.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { requireUserId } from "../auth/user-context.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { financialsService } from "../market/financials/financials.service.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { logger } from "../shared/logger.service.js";
import { isMarketDataUnavailable } from "../yahoo/index.js";
import { readCachedFundamentalsSummary } from "../yahoo/fundamentals/fundamentals.job.js";
import { portfolioService } from "./portfolio.service.js";

type Fundamentals = Awaited<ReturnType<typeof marketDataGateway.readFundamentalsWithCache>>["data"];
type FinancialStatementRow = {
  totalRevenue?: unknown;
  netIncome?: unknown;
  endDate?: unknown;
};

const UNKNOWN = "Unknown";
const ETF_DIVERSIFIED = "ETF / Diversified";
const SECTOR_EXPOSURE_VERSION = 2;
const ETF_SECTOR_LABELS: Record<string, string> = {
  realestate: "Immobilier",
  consumer_cyclical: "Consommation cyclique",
  basic_materials: "Materiaux de base",
  consumer_defensive: "Consommation defensive",
  technology: "Technologie",
  communication_services: "Communication",
  financial_services: "Services financiers",
  utilities: "Services publics",
  industrials: "Industrie",
  energy: "Energie",
  healthcare: "Sante"
};

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
  const year = candidate && (typeof timestamp === "string" || typeof timestamp === "number" || timestamp instanceof Date) ? new Date(timestamp).getFullYear() : undefined;
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
  const sectorExposure = getPositionSectorExposure(position, fundamentals, 100)[0];
  if (sectorExposure) return sectorExposure.sector;
  return UNKNOWN;
}

function rawSectorWeightings(fundamentals?: Fundamentals): Array<{ sector: string; weight: number }> {
  const rawSectors = fundamentals?.topHoldings?.sectorWeightings;
  if (!Array.isArray(rawSectors)) return [];

  const weightings = rawSectors.flatMap((sectorWeighting) => {
    if (!sectorWeighting || typeof sectorWeighting !== "object") return [];
    return Object.entries(sectorWeighting as Record<string, unknown>).flatMap(([key, value]) => {
      const sector = formatSectorKey(key);
      const numericValue = safeNumber(value);
      if (!sector || numericValue === undefined || numericValue <= 0) return [];
      return [{ sector, weight: numericValue }];
    });
  });

  const total = weightings.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  const scale = total > 1.5 ? 100 : 1;
  const scaled = weightings.map((item) => ({ ...item, weight: item.weight / scale }));
  const scaledTotal = scaled.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(scaledTotal) || scaledTotal <= 0) return [];
  return scaled.map((item) => ({ ...item, weight: item.weight / scaledTotal }));
}

function formatSectorKey(value: string) {
  const key = value.trim();
  if (!key) return "";
  return ETF_SECTOR_LABELS[key] ?? key
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPositionSectorExposure(position: PositionWithMarket, fundamentals: Fundamentals | undefined, weight: number): Array<{ sector: string; weight: number }> {
  if (!Number.isFinite(weight) || weight <= 0) return [];
  if (isEtf(position, fundamentals)) {
    const sectors = rawSectorWeightings(fundamentals);
    if (sectors.length) {
      return sectors
        .map((item) => ({ sector: item.sector, weight: weight * item.weight }))
        .filter((item) => item.sector && Number.isFinite(item.weight) && item.weight > 0)
        .sort((a, b) => b.weight - a.weight);
    }
    return [{ sector: ETF_DIVERSIFIED, weight }];
  }
  return [{ sector: safeText(fundamentals?.assetProfile?.sectorDisp) ?? safeText(fundamentals?.assetProfile?.sector) ?? UNKNOWN, weight }];
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
    .map((row: FinancialStatementRow) => {
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

function persistedFundamentals(symbol: string): Fundamentals | undefined {
  const asset = assetRepository.findBySymbol(symbol);
  if (!asset) return undefined;
  const profile = assetRepository.profileByAssetId(asset.id);
  const cachedSummary = readCachedFundamentalsSummary(symbol);
  return {
    ...cachedSummary?.data,
    quoteType: {
      ...(cachedSummary?.data?.quoteType && typeof cachedSummary.data.quoteType === "object" ? cachedSummary.data.quoteType : {}),
      quoteType: asset.quote_type ?? (cachedSummary?.data?.quoteType as { quoteType?: string } | undefined)?.quoteType ?? undefined
    },
    assetProfile: {
      ...(cachedSummary?.data?.assetProfile ?? {}),
      country: profile?.country ?? cachedSummary?.data?.assetProfile?.country ?? undefined,
      sector: profile?.sector ?? cachedSummary?.data?.assetProfile?.sector ?? undefined,
      sectorDisp: profile?.sector ?? cachedSummary?.data?.assetProfile?.sectorDisp ?? undefined
    },
    annualFinancials: financialsService.readFinancialRows(symbol)
  } as Fundamentals;
}

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
