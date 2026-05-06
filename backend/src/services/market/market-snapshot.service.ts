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
import { getLastTradingDay, isMarketOpen } from "./marketCalendar.service.js";

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
    if (snapshot && !isMarketOpen(snapshot.marketState)) {
      const session = getLastTradingDay(knownAsset.symbol, knownAsset.exchange);
      if (Date.now() >= session.period2.getTime()) {
        this.snapshotQuoteCache.set(key, { quote: snapshot, expiresAt: Date.now() + 30_000 });
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
    const row = db.prepare("SELECT * FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id) as any;
    if (!row) return undefined;
    return {
      symbol: asset.symbol,
      marketState: normalizeMarketState(row.market_state),
      regularMarketPrice: row.last_price == null ? undefined : Number(row.last_price),
      regularMarketTime: row.regular_market_time ?? undefined,
      previousClose: row.previous_close == null ? undefined : Number(row.previous_close),
      openPrice: row.open_price == null ? undefined : Number(row.open_price),
      dayHigh: row.day_high == null ? undefined : Number(row.day_high),
      dayLow: row.day_low == null ? undefined : Number(row.day_low),
      dayChange: Number(row.day_change ?? 0),
      dayChangePercent: Number(row.day_change_percent ?? 0),
      volume: Number(row.volume ?? 0),
      avgVolume3M: row.average_volume_3m == null ? undefined : Number(row.average_volume_3m),
      bid: row.bid_price == null ? undefined : Number(row.bid_price),
      ask: row.ask_price == null ? undefined : Number(row.ask_price),
      currency: row.currency ?? undefined,
      exchangeName: row.full_exchange_name ?? row.exchange ?? undefined,
      quoteType: row.quote_type ?? undefined,
      dividendYield: row.dividend_yield == null ? undefined : Number(row.dividend_yield),
      annualDividend: row.dividend_rate == null ? undefined : Number(row.dividend_rate),
      cachedAt: new Date(row.updated_at).getTime(),
      expiresAt: new Date(row.updated_at).getTime()
    };
  }

  invalidateCache(symbol: string): void {
    this.snapshotQuoteCache.delete(symbol.toUpperCase());
  }

  upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    db.prepare(
      `INSERT INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size, average_volume_3m, dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield, currency, exchange,
        full_exchange_name, quote_type, regular_market_time, source, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP)
       ON CONFLICT(asset_id) DO UPDATE SET
        market_state = COALESCE(excluded.market_state, asset_market_snapshots.market_state),
        last_price = COALESCE(excluded.last_price, asset_market_snapshots.last_price),
        day_change = COALESCE(excluded.day_change, asset_market_snapshots.day_change),
        day_change_percent = COALESCE(excluded.day_change_percent, asset_market_snapshots.day_change_percent),
        previous_close = COALESCE(excluded.previous_close, asset_market_snapshots.previous_close),
        open_price = COALESCE(excluded.open_price, asset_market_snapshots.open_price),
        day_high = COALESCE(excluded.day_high, asset_market_snapshots.day_high),
        day_low = COALESCE(excluded.day_low, asset_market_snapshots.day_low),
        volume = COALESCE(excluded.volume, asset_market_snapshots.volume),
        bid_price = COALESCE(excluded.bid_price, asset_market_snapshots.bid_price),
        ask_price = COALESCE(excluded.ask_price, asset_market_snapshots.ask_price),
        bid_size = COALESCE(excluded.bid_size, asset_market_snapshots.bid_size),
        ask_size = COALESCE(excluded.ask_size, asset_market_snapshots.ask_size),
        average_volume_3m = COALESCE(excluded.average_volume_3m, asset_market_snapshots.average_volume_3m),
        dividend_rate = COALESCE(excluded.dividend_rate, asset_market_snapshots.dividend_rate),
        dividend_yield = COALESCE(excluded.dividend_yield, asset_market_snapshots.dividend_yield),
        trailing_annual_dividend_rate = COALESCE(excluded.trailing_annual_dividend_rate, asset_market_snapshots.trailing_annual_dividend_rate),
        trailing_annual_dividend_yield = COALESCE(excluded.trailing_annual_dividend_yield, asset_market_snapshots.trailing_annual_dividend_yield),
        currency = COALESCE(excluded.currency, asset_market_snapshots.currency),
        exchange = COALESCE(excluded.exchange, asset_market_snapshots.exchange),
        full_exchange_name = COALESCE(excluded.full_exchange_name, asset_market_snapshots.full_exchange_name),
        quote_type = COALESCE(excluded.quote_type, asset_market_snapshots.quote_type),
        regular_market_time = COALESCE(excluded.regular_market_time, asset_market_snapshots.regular_market_time),
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
      snapshot.bid,
      snapshot.ask,
      snapshot.bidSize,
      snapshot.askSize,
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

    db.prepare(
      `UPDATE assets SET
        name = COALESCE(?, ?, name),
        exchange = COALESCE(?, exchange),
        currency = COALESCE(?, currency),
        quote_type = COALESCE(?, quote_type),
        type_disp = COALESCE(?, type_disp),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      snapshot.longName,
      snapshot.shortName,
      snapshot.exchange ?? snapshot.fullExchangeName,
      snapshot.currency,
      snapshot.quoteType,
      snapshot.typeDisp,
      assetId
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
