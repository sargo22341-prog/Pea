/**
 * Role du fichier : gerer l'etat courant du marche par asset. Cette table n'est
 * pas un cache TTL: une seule ligne represente le dernier etat connu.
 */

import type { AssetMarketDto, Quote } from "@pea/shared";
import { db } from "../../db.js";
import { normalizeMarketState } from "../shared/cache.service.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import type { YahooSnapshotPayload } from "../yahoo/yahoo.mapper.js";
import { assetRepository, type AssetRow } from "./asset.repository.js";
import { candleRepository } from "../candles/candle.repository.js";
import { isMarketOpen } from "./marketCalendar.service.js";

export class MarketSnapshotService {
  private snapshotQuoteCache = new Map<string, { quote: Quote; expiresAt: number }>();

  async refreshMarketSnapshot(asset: AssetRow | string): Promise<Quote> {
    const symbol = typeof asset === "string" ? asset.toUpperCase() : asset.symbol;
    const result = await yahooApi.quote(symbol);
    const assetRow = assetRepository.upsertFromQuote(result.snapshot);
    this.upsertSnapshot(assetRow.id, result.snapshot);
    this.snapshotQuoteCache.set(assetRow.symbol, { quote: result.quote, expiresAt: Date.now() + 30_000 });
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

    const snapshot = this.readSnapshot(knownAsset.id);
    const latestFinalizedTradingDate = candleRepository.latestFinalizedTradingDate(knownAsset.id, "1d");
    if (snapshot && latestFinalizedTradingDate && !isMarketOpen(snapshot.marketState)) {
      this.snapshotQuoteCache.set(key, { quote: snapshot, expiresAt: Date.now() + 30_000 });
      return snapshot;
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
    const row = db.prepare("SELECT * FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id) as any;
    if (!row) return undefined;
    return {
      symbol: asset.symbol,
      marketState: normalizeMarketState(row.market_state),
      dayChange: Number(row.day_change ?? 0),
      dayChangePercent: Number(row.day_change_percent ?? 0),
      volume: Number(row.volume ?? 0),
      avgVolume3M: row.average_volume_3m == null ? undefined : Number(row.average_volume_3m),
      dividendYield: row.dividend_yield == null ? undefined : Number(row.dividend_yield),
      annualDividend: row.dividend_rate == null ? undefined : Number(row.dividend_rate),
      cachedAt: new Date(row.updated_at).getTime(),
      expiresAt: new Date(row.updated_at).getTime()
    };
  }

  private upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    db.prepare(
      `INSERT INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, average_volume_3m, dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield, currency, exchange,
        full_exchange_name, quote_type, regular_market_time, source, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP)
       ON CONFLICT(asset_id) DO UPDATE SET
        market_state = excluded.market_state,
        last_price = excluded.last_price,
        day_change = excluded.day_change,
        day_change_percent = excluded.day_change_percent,
        previous_close = excluded.previous_close,
        open_price = excluded.open_price,
        day_high = excluded.day_high,
        day_low = excluded.day_low,
        volume = excluded.volume,
        average_volume_3m = excluded.average_volume_3m,
        dividend_rate = excluded.dividend_rate,
        dividend_yield = excluded.dividend_yield,
        trailing_annual_dividend_rate = excluded.trailing_annual_dividend_rate,
        trailing_annual_dividend_yield = excluded.trailing_annual_dividend_yield,
        currency = excluded.currency,
        exchange = excluded.exchange,
        full_exchange_name = excluded.full_exchange_name,
        quote_type = excluded.quote_type,
        regular_market_time = excluded.regular_market_time,
        source = excluded.source,
        updated_at = excluded.updated_at`
    ).run(
      assetId,
      snapshot.marketState,
      snapshot.regularMarketPrice,
      snapshot.regularMarketChange,
      snapshot.regularMarketChangePercent,
      snapshot.regularMarketPreviousClose,
      snapshot.regularMarketOpen,
      snapshot.regularMarketDayHigh,
      snapshot.regularMarketDayLow,
      snapshot.regularMarketVolume,
      snapshot.averageDailyVolume3Month,
      snapshot.dividendRate,
      snapshot.dividendYield,
      snapshot.trailingAnnualDividendRate,
      snapshot.trailingAnnualDividendYield,
      snapshot.currency,
      snapshot.exchange,
      snapshot.fullExchangeName,
      snapshot.quoteType,
      snapshot.regularMarketTime
    );
  }

  /**
   * Lit la derniere quote persistee sans appel Yahoo.
   *
   * @param assetId Identifiant interne de l'asset.
   * @returns Quote locale si le snapshot existe.
   */
  readSnapshot(assetId: number): Quote | undefined {
    const row = db.prepare("SELECT a.symbol, a.name, s.* FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE s.asset_id = ?").get(assetId) as any;
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
      dividendYield: row.dividend_yield == null ? undefined : Number(row.dividend_yield)
    };
  }
}

export const marketSnapshotService = new MarketSnapshotService();
