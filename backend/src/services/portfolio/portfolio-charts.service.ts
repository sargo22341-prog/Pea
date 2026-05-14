import type { MarketSessionDto, PortfolioChartDto, PortfolioFullDto, PortfolioTransactionMarker, Position, RangeKey } from "@pea/shared";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { portfolioChartRepository } from "../../repositories/portfolio/portfolio-chart.repository.js";
import { requireUserId } from "../auth/user-context.js";
import { getMarketSessionInfo } from "../market/calendars/marketCalendar.service.js";
import { marketDataService } from "../market/data/market-data.service.js";
import { nowMs, toDisplayRange } from "../shared/cache.service.js";
import { isTransactionVisibleInRange, nearestTimestamp } from "./portfolio.helpers.js";
import { buildTransactionCache, getQuantityAtTime } from "./portfolio-calculations.js";
import { portfolioPerformanceService } from "./portfolio-performance.service.js";
import { portfolioReadService } from "./portfolio-read.service.js";
import type { PortfolioMarketDataOptions } from "./portfolio.types.js";

const portfolioTransactionMarkerRanges = new Set<RangeKey>(["1w", "1m", "ytd", "1y", "5y", "10y", "all"]);

/**
 * `PortfolioChartsService` (anciennement `PortfolioChartService`) : compose le DTO chart
 * portfolio (full, chart, transaction markers, intraday baseline, preparation state).
 * Utilise `PortfolioPerformanceService` pour les calculs et `portfolioChartRepository` pour
 * le cache SQL.
 */
export class PortfolioChartsService {
  private static readonly CHART_CACHE_TTL_MS: Partial<Record<RangeKey, number>> = {
    "1d": 5 * 60 * 1000,
    "1w": 60 * 60 * 1000,
    "1m": 4 * 60 * 60 * 1000,
    "ytd": 4 * 60 * 60 * 1000,
    "1y": 4 * 60 * 60 * 1000,
    "5y": 12 * 60 * 60 * 1000,
    "10y": 12 * 60 * 60 * 1000,
    all: 12 * 60 * 60 * 1000
  };

  async full(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioFullDto> {
    const resolvedUserId = requireUserId(userId);
    const [summary, chart] = await Promise.all([
      portfolioReadService.summary(range, resolvedUserId),
      this.chart(range, resolvedUserId, options)
    ]);
    return { summary, chart };
  }

  async chart(range: RangeKey, userId?: string | number, options: PortfolioMarketDataOptions = {}): Promise<PortfolioChartDto> {
    const resolvedUserId = requireUserId(userId);
    const cacheUserId = String(resolvedUserId);

    if (!options.forceIntradayOpen && !options.intradayNow) {
      const cacheKey = `${cacheUserId}:${range}`;
      const cached = portfolioChartRepository.readChartCache(cacheKey, nowMs());
      if (cached) return cached;
    }

    const points = await portfolioPerformanceService.performance(range, options, resolvedUserId);
    const positions = portfolioReadService.listPositions(resolvedUserId);
    const totalInvested = positions.reduce((sum, position) => sum + position.quantity * position.averageBuyPrice, 0);
    const timestamps: number[] = [];
    const value: number[] = [];
    const invested: number[] = [];
    const gain: number[] = [];
    const gainPercent: number[] = [];

    for (const point of points) {
      const timestamp = new Date(point.date).getTime();
      if (!Number.isFinite(timestamp) || !Number.isFinite(point.value)) continue;
      const investedAtPoint = point.invested ?? totalInvested;
      const gainAtPoint = point.gain ?? point.value - investedAtPoint;
      timestamps.push(timestamp);
      value.push(point.value);
      invested.push(investedAtPoint);
      gain.push(gainAtPoint);
      gainPercent.push(point.gainPercent ?? (investedAtPoint ? (gainAtPoint / investedAtPoint) * 100 : 0));
    }

    const first = value[0] ?? 0;
    const last = value[value.length - 1] ?? first;
    const firstGain = gain[0] ?? 0;
    const lastGain = gain[gain.length - 1] ?? firstGain;
    const firstInvested = invested[0] ?? 0;
    const lastInvested = invested[invested.length - 1] ?? firstInvested;
    const baseline = range === "1d" ? await this.portfolioIntradayBaseline(resolvedUserId, options) : undefined;
    const performanceStart = baseline?.price ?? first;
    const performanceEuro = range === "1d" && baseline ? last - performanceStart : lastGain - firstGain;
    const performanceBase = range === "1d" && baseline ? performanceStart : firstInvested || lastInvested;
    const cachedAt = nowMs();
    const preparation = await this.portfolioPreparationState(range, resolvedUserId, options);
    const payload: PortfolioChartDto = {
      userId: cacheUserId,
      range: toDisplayRange(range),
      timestamps,
      value,
      invested,
      gain,
      gainPercent,
      baselinePrice: baseline?.price,
      baselineDatetime: baseline?.datetime,
      marketSession: range === "1d" ? this.portfolioMarketSession(positions) : undefined,
      performanceEuro,
      performancePercent: performanceBase ? (performanceEuro / performanceBase) * 100 : 0,
      ...preparation,
      cachedAt,
      expiresAt: cachedAt,
      transactionMarkers: this.transactionMarkersForChart(range, timestamps, resolvedUserId)
    };

    if (!payload.isPreparing && !options.forceIntradayOpen && !options.intradayNow) {
      const ttl = PortfolioChartsService.CHART_CACHE_TTL_MS[range] ?? 4 * 60 * 60 * 1000;
      const expiresAt = cachedAt + ttl;
      const cacheKey = `${cacheUserId}:${range}`;
      portfolioChartRepository.upsertChartCache({ cacheKey, userId: cacheUserId, range, payload, cachedAt, expiresAt });
    }

    return payload;
  }

  private transactionMarkersForChart(range: RangeKey, timestamps: number[], userId: number): PortfolioTransactionMarker[] {
    if (!portfolioTransactionMarkerRanges.has(range) || timestamps.length === 0) return [];

    const sortedTimestamps = [...timestamps].filter(Number.isFinite).sort((a, b) => a - b);
    const firstTimestamp = sortedTimestamps[0];
    const lastTimestamp = sortedTimestamps[sortedTimestamps.length - 1];
    if (!Number.isFinite(firstTimestamp) || !Number.isFinite(lastTimestamp)) return [];

    const rows = portfolioChartRepository.listTransactionMarkers(userId);

    return rows.flatMap((row) => {
      const transactionTime = new Date(row.traded_at).getTime();
      if (!Number.isFinite(transactionTime) || !isTransactionVisibleInRange(row.traded_at, transactionTime, firstTimestamp, lastTimestamp, range)) return [];
      const symbol = String(row.symbol).toUpperCase();
      const price = row.price == null ? undefined : Number(row.price);
      return [{
        id: String(row.id),
        assetId: String(row.asset_row_id ?? row.position_id),
        symbol,
        name: String(row.asset_name ?? row.position_name ?? symbol),
        logoUrl: `/api/assets/${encodeURIComponent(symbol)}/icon`,
        quantity: Number(row.quantity),
        price: Number.isFinite(price) ? price : undefined,
        transactionDate: new Date(transactionTime).toISOString(),
        type: row.type,
        nearestChartPointDatetime: nearestTimestamp(transactionTime, sortedTimestamps)
      }];
    });
  }

  private portfolioMarketSession(positions: Position[]): MarketSessionDto | undefined {
    if (!positions.length) return undefined;
    const sessions = positions.map((position) => {
      const asset = assetRepository.findBySymbol(position.symbol);
      return getMarketSessionInfo(position.symbol, asset?.exchange);
    });
    const groups = new Map<string, { session: MarketSessionDto; count: number; cities: Set<string> }>();
    for (const session of sessions) {
      const key = `${session.timezone}|${session.open}|${session.close}`;
      const group = groups.get(key);
      if (group) {
        group.count += 1;
        group.cities.add(session.city);
      } else {
        groups.set(key, { session, count: 1, cities: new Set([session.city]) });
      }
    }

    const dominant = [...groups.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant) return undefined;
    return {
      ...dominant.session,
      city: dominant.cities.size === 1 ? dominant.session.city : dominant.session.timezone
    };
  }

  private async portfolioIntradayBaseline(userId: number, options: PortfolioMarketDataOptions = {}): Promise<{ price: number; datetime?: string } | undefined> {
    const positions = portfolioReadService.listPositions(userId);
    if (!positions.length) return undefined;

    const txCache = buildTransactionCache(positions.map((p) => p.id));
    let price = 0;
    const datetimes: string[] = [];
    for (const position of positions) {
      const chart = await marketDataService.getChartData(position.symbol, "1d", options).catch(() => undefined);
      if (!chart?.baselinePrice || !Number.isFinite(chart.baselinePrice)) continue;
      let quantity: number;
      const entry = txCache.get(position.id);
      if (chart.baselineDatetime && entry?.hasDated) {
        quantity = getQuantityAtTime(entry.transactions, new Date(chart.baselineDatetime).getTime());
      } else {
        quantity = position.quantity;
      }
      price += chart.baselinePrice * quantity;
      if (chart.baselineDatetime) datetimes.push(chart.baselineDatetime);
    }

    if (!price) return undefined;
    return { price, datetime: datetimes.sort((a, b) => b.localeCompare(a))[0] };
  }

  private async portfolioPreparationState(range: RangeKey, userId: number, options: PortfolioMarketDataOptions = {}): Promise<Pick<PortfolioChartDto, "isPreparing" | "missingAssets" | "missingRanges" | "jobId">> {
    const missingAssets: string[] = [];
    const jobIds: string[] = [];
    for (const position of portfolioReadService.listPositions(userId)) {
      const chart = await marketDataService.getChartData(position.symbol, range, options);
      if (chart.isPreparing) {
        missingAssets.push(position.symbol);
        if (chart.jobId) jobIds.push(chart.jobId);
      }
    }
    return {
      isPreparing: missingAssets.length > 0,
      missingAssets,
      missingRanges: missingAssets.length > 0 ? [range] : undefined,
      jobId: jobIds[0]
    };
  }
}

export const portfolioChartsService = new PortfolioChartsService();
