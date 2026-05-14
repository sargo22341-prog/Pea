import type { AssetMarketDto, AssetMarketInfo, Quote } from "@pea/shared";
import { config } from "../../../config.js";
import { normalizeMarketState } from "../../shared/cache.service.js";
import { normalizeDividendYield, type YahooSnapshotPayload } from "../../yahoo/yahoo.mapper.js";
import { writeCache } from "../../yahoo/cache/yahoo.cache.js";
import { chartConfigService } from "../charts/chart-config.service.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { marketSnapshotRepository } from "../../../repositories/market/market-snapshot.repository.js";
import { candleRepository } from "../../../repositories/candles/candle.repository.js";
import { getLastTradingDay, isMarketOpen } from "../calendars/marketCalendar.service.js";
import { marketDataGateway } from "../data/market-data-gateway.service.js";

function optionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export class MarketSnapshotService {
  private snapshotQuoteCache = new Map<string, { quote: Quote; expiresAt: number }>();
  private readonly maxSnapshotQuoteCacheEntries = 500;

  async refreshMarketSnapshot(asset: AssetRow | string): Promise<Quote> {
    const symbol = typeof asset === "string" ? asset.toUpperCase() : asset.symbol;
    const result = await marketDataGateway.fetchFreshQuote(symbol);
    const assetRow = assetRepository.upsertFromQuote(result.snapshot);
    this.upsertSnapshot(assetRow.id, result.snapshot);
    this.writeSnapshotQuoteCache(assetRow.symbol, result.quote, Date.now() + 30_000);
    return result.quote;
  }

  async getQuote(symbol: string, options: { forceRefresh?: boolean } = {}): Promise<Quote> {
    const key = symbol.toUpperCase();
    const knownAsset = assetRepository.findBySymbol(key);
    if (options.forceRefresh || !knownAsset) {
      return this.refreshMarketSnapshot(knownAsset ?? key);
    }

    const memoized = this.snapshotQuoteCache.get(key);
    if (memoized && memoized.expiresAt > Date.now()) return memoized.quote;
    if (memoized) this.snapshotQuoteCache.delete(key);

    const snapshot = this.readSnapshot(knownAsset.id);
    if (snapshot && config.enableMarketLiveRefresh && this.snapshotWasCheckedRecently(knownAsset.id)) {
      this.writeSnapshotQuoteCache(key, snapshot, Date.now() + 30_000);
      return snapshot;
    }
    const latestFinalizedTradingDate = candleRepository.latestFinalizedTradingDate(knownAsset.id, "1d");
    if (snapshot && latestFinalizedTradingDate && !isMarketOpen(snapshot.marketState)) {
      this.writeSnapshotQuoteCache(key, snapshot, Date.now() + 30_000);
      return snapshot;
    }
    if (snapshot && !isMarketOpen(snapshot.marketState)) {
      const session = getLastTradingDay(knownAsset.symbol, knownAsset.exchange);
      if (Date.now() >= session.period2.getTime()) {
        this.writeSnapshotQuoteCache(key, snapshot, Date.now() + 30_000);
        return snapshot;
      }
    }
    return this.refreshMarketSnapshot(knownAsset);
  }

  async refreshAllTracked() {
    const quotes: Quote[] = [];
    for (const symbol of assetRepository.listTrackedSymbols()) quotes.push(await this.refreshMarketSnapshot(symbol));
    return { updated: quotes.length };
  }

  readMarketDto(symbol: string): AssetMarketDto | undefined {
    const asset = assetRepository.findBySymbol(symbol);
    if (!asset) return undefined;
    const row = marketSnapshotRepository.findByAssetId(asset.id);
    if (!row) return undefined;
    return {
      symbol: asset.symbol,
      marketState: normalizeMarketState(row.market_state),
      regularMarketPrice: optionalNumber(row.last_price),
      regularMarketTime: row.regular_market_time ?? undefined,
      previousClose: optionalNumber(row.previous_close),
      openPrice: optionalNumber(row.open_price),
      dayHigh: optionalNumber(row.day_high),
      dayLow: optionalNumber(row.day_low),
      dayChange: optionalNumber(row.day_change),
      dayChangePercent: optionalNumber(row.day_change_percent),
      volume: optionalNumber(row.volume),
      avgVolume3M: optionalNumber(row.average_volume_3m),
      avgVolume10D: optionalNumber(row.average_volume_10d),
      bid: optionalNumber(row.bid_price),
      ask: optionalNumber(row.ask_price),
      currency: row.currency ?? undefined,
      exchangeName: row.full_exchange_name ?? row.exchange ?? undefined,
      quoteType: row.quote_type ?? undefined,
      week52Low: optionalNumber(row.fifty_two_week_low),
      week52High: optionalNumber(row.fifty_two_week_high),
      dividendYield: normalizeDividendYield(row.dividend_yield) ?? undefined,
      annualDividend: optionalNumber(row.dividend_rate),
      exDividendDate: row.ex_dividend_date ?? undefined,
      freshness: {
        marketCoreUpdatedAt: row.market_core_updated_at ?? undefined,
        liquidityUpdatedAt: row.liquidity_updated_at ?? undefined,
        range52wUpdatedAt: row.range_52w_updated_at ?? undefined,
        dividendInfoUpdatedAt: row.dividend_info_updated_at ?? undefined,
        marketProfileUpdatedAt: row.market_profile_updated_at ?? undefined
      },
      cachedAt: new Date(row.updated_at).getTime(),
      expiresAt: new Date(row.updated_at).getTime()
    };
  }

  invalidateCache(symbol: string): void {
    this.snapshotQuoteCache.delete(symbol.toUpperCase());
  }

  primeQuoteCache(symbol: string, quote: Quote, ttlMs = 30_000): void {
    const key = symbol.toUpperCase();
    this.writeSnapshotQuoteCache(key, { ...quote, symbol: key }, Date.now() + ttlMs);
    writeCache("cached_quotes", key, quote);
  }

  storeBatchSnapshot(asset: AssetRow, quote: Quote, snapshot: YahooSnapshotPayload, ttlMs = 30_000): void {
    this.upsertSnapshot(asset.id, snapshot);
    this.primeQuoteCache(asset.symbol, quote, ttlMs);
  }

  upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    marketSnapshotRepository.upsertSnapshot(assetId, snapshot);
    marketSnapshotRepository.updateAssetFromSnapshot(assetId, snapshot);
  }

  upsertMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    marketSnapshotRepository.upsertMarketInfo(assetId, marketInfo);
  }

  /**
   * Lit la derniere quote persistee sans appel Yahoo.
   *
   * @param assetId Identifiant interne de l'asset.
   * @returns Quote locale si le snapshot existe.
   */
  readSnapshot(assetId: number): Quote | undefined {
    const row = marketSnapshotRepository.readQuoteSnapshot(assetId);
    if (!row) return undefined;
    return {
      symbol: String(row.symbol),
      name: String(row.name),
      price: Number(row.last_price ?? row.previous_close ?? 0),
      previousClose: row.previous_close == null ? undefined : Number(row.previous_close),
      change: row.day_change == null ? undefined : Number(row.day_change),
      changePercent: row.day_change_percent == null ? undefined : Number(row.day_change_percent),
      currency: row.currency ?? "EUR",
      exchange: row.full_exchange_name ?? row.exchange ?? undefined,
      quoteType: row.quote_type ?? undefined,
      marketState: row.market_state ?? undefined,
      dividendRate: row.dividend_rate == null ? undefined : Number(row.dividend_rate),
      dividendYield: normalizeDividendYield(row.dividend_yield) ?? undefined
    };
  }

  readSnapshotBySymbol(symbol: string): Quote | undefined {
    const asset = assetRepository.findBySymbol(symbol.toUpperCase());
    return asset ? this.readSnapshot(asset.id) : undefined;
  }

  private snapshotWasCheckedRecently(assetId: number) {
    const lastCheckedAt = marketSnapshotRepository.lastCheckedAt(assetId);
    if (!lastCheckedAt) return false;
    const checkedAt = new Date(lastCheckedAt).getTime();
    return Number.isFinite(checkedAt) && Date.now() - checkedAt < chartConfigService.getSnapshotRefreshIntervalMs();
  }

  private writeSnapshotQuoteCache(symbol: string, quote: Quote, expiresAt: number) {
    this.pruneSnapshotQuoteCache();
    this.snapshotQuoteCache.set(symbol.toUpperCase(), { quote, expiresAt });
    while (this.snapshotQuoteCache.size > this.maxSnapshotQuoteCacheEntries) {
      const oldestKey = [...this.snapshotQuoteCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]?.[0];
      if (!oldestKey) return;
      this.snapshotQuoteCache.delete(oldestKey);
    }
  }

  private pruneSnapshotQuoteCache(now = Date.now()) {
    for (const [key, value] of this.snapshotQuoteCache) {
      if (value.expiresAt <= now) this.snapshotQuoteCache.delete(key);
    }
  }
}

export const marketSnapshotService = new MarketSnapshotService();
