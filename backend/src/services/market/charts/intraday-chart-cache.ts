import type { AssetChartDto } from "@pea/shared";

export const intradayChartCache = new Map<string, { chart: AssetChartDto; expiresAt: number }>();
export const intradayRefreshInFlight = new Map<string, Promise<{ updated: number; yahooCalls: number }>>();
const maxIntradayChartCacheEntries = 500;

export function cloneChartDto(chart: AssetChartDto): AssetChartDto {
  return {
    ...chart,
    timestamps: [...chart.timestamps],
    prices: [...chart.prices],
    performance: chart.performance ? [...chart.performance] : undefined,
    missingAssets: chart.missingAssets ? [...chart.missingAssets] : undefined,
    missingRanges: chart.missingRanges ? [...chart.missingRanges] : undefined,
    marketSession: chart.marketSession ? { ...chart.marketSession } : undefined
  };
}

export function readIntradayChartCache(key: string): AssetChartDto | undefined {
  const cached = intradayChartCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    intradayChartCache.delete(key);
    return undefined;
  }
  return cloneChartDto(cached.chart);
}

export function writeIntradayChartCache(key: string, chart: AssetChartDto, expiresAt: number) {
  pruneIntradayChartCache();
  intradayChartCache.set(key, { chart: cloneChartDto(chart), expiresAt });
  trimCacheByExpiry(intradayChartCache, maxIntradayChartCacheEntries);
}

export function pruneIntradayChartCache(now = Date.now()) {
  for (const [key, value] of intradayChartCache) {
    if (value.expiresAt <= now) intradayChartCache.delete(key);
  }
}

export function intradayChartMemoryStats() {
  return {
    intradayChartCacheEntries: intradayChartCache.size,
    intradayRefreshInFlight: intradayRefreshInFlight.size
  };
}

function trimCacheByExpiry<T extends { expiresAt: number }>(cache: Map<string, T>, maxEntries: number) {
  if (cache.size <= maxEntries) return;
  const overflow = cache.size - maxEntries;
  const keys = [...cache.entries()]
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .slice(0, overflow)
    .map(([key]) => key);
  for (const key of keys) cache.delete(key);
}
