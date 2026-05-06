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

function optionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

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
      bid: optionalNumber(row.bid_price),
      ask: optionalNumber(row.ask_price),
      currency: row.currency ?? undefined,
      exchangeName: row.full_exchange_name ?? row.exchange ?? undefined,
      quoteType: row.quote_type ?? undefined,
      dividendYield: optionalNumber(row.dividend_yield),
      annualDividend: optionalNumber(row.dividend_rate),
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
        updated_at = CASE
          WHEN (excluded.market_state IS NOT NULL AND excluded.market_state IS NOT asset_market_snapshots.market_state)
            OR excluded.last_price IS NOT NULL
            OR excluded.day_change IS NOT NULL
            OR excluded.day_change_percent IS NOT NULL
            OR excluded.previous_close IS NOT NULL
            OR excluded.open_price IS NOT NULL
            OR excluded.day_high IS NOT NULL
            OR excluded.day_low IS NOT NULL
            OR excluded.volume IS NOT NULL
            OR excluded.bid_price IS NOT NULL
            OR excluded.ask_price IS NOT NULL
            OR excluded.bid_size IS NOT NULL
            OR excluded.ask_size IS NOT NULL
            OR excluded.average_volume_3m IS NOT NULL
            OR excluded.dividend_rate IS NOT NULL
            OR excluded.dividend_yield IS NOT NULL
            OR excluded.trailing_annual_dividend_rate IS NOT NULL
            OR excluded.trailing_annual_dividend_yield IS NOT NULL
            OR excluded.currency IS NOT NULL
            OR excluded.exchange IS NOT NULL
            OR excluded.full_exchange_name IS NOT NULL
            OR excluded.quote_type IS NOT NULL
            OR excluded.regular_market_time IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.updated_at
        END`
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
