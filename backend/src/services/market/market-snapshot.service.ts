/**
 * Role du fichier : gerer l'etat courant du marche par asset. Cette table n'est
 * pas un cache TTL: une seule ligne represente le dernier etat connu.
 */

import type { AssetMarketDto, AssetMarketInfo, Quote } from "@pea/shared";
import { db } from "../../db.js";
import { config } from "../../config.js";
import { normalizeMarketState } from "../shared/cache.service.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import { normalizeDividendYield, type YahooSnapshotPayload } from "../yahoo/yahoo.mapper.js";
import { writeCache } from "../yahoo/cache/yahoo.cache.js";
import { chartConfigService } from "./chart-config.service.js";
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
    if (snapshot && config.enableMarketLiveRefresh && this.snapshotWasCheckedRecently(knownAsset.id)) {
      this.snapshotQuoteCache.set(key, { quote: snapshot, expiresAt: Date.now() + 30_000 });
      return snapshot;
    }
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
      cachedAt: new Date(row.updated_at).getTime(),
      expiresAt: new Date(row.updated_at).getTime()
    };
  }

  invalidateCache(symbol: string): void {
    this.snapshotQuoteCache.delete(symbol.toUpperCase());
  }

  primeQuoteCache(symbol: string, quote: Quote, ttlMs = 30_000): void {
    const key = symbol.toUpperCase();
    this.snapshotQuoteCache.set(key, { quote: { ...quote, symbol: key }, expiresAt: Date.now() + ttlMs });
    writeCache("cached_quotes", key, quote);
  }

  storeBatchSnapshot(asset: AssetRow, quote: Quote, snapshot: YahooSnapshotPayload, ttlMs = 30_000): void {
    this.upsertSnapshot(asset.id, snapshot);
    this.primeQuoteCache(asset.symbol, quote, ttlMs);
  }

  upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    db.prepare(
      `INSERT INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size, average_volume_3m,
        average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date,
        dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield, currency, exchange,
        full_exchange_name, quote_type, regular_market_time, source, last_checked_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
        average_volume_10d = COALESCE(excluded.average_volume_10d, asset_market_snapshots.average_volume_10d),
        fifty_two_week_low = COALESCE(excluded.fifty_two_week_low, asset_market_snapshots.fifty_two_week_low),
        fifty_two_week_high = COALESCE(excluded.fifty_two_week_high, asset_market_snapshots.fifty_two_week_high),
        fifty_two_week_change_percent = COALESCE(excluded.fifty_two_week_change_percent, asset_market_snapshots.fifty_two_week_change_percent),
        ex_dividend_date = COALESCE(excluded.ex_dividend_date, asset_market_snapshots.ex_dividend_date),
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
        last_checked_at = excluded.last_checked_at,
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
            OR excluded.average_volume_10d IS NOT NULL
            OR excluded.fifty_two_week_low IS NOT NULL
            OR excluded.fifty_two_week_high IS NOT NULL
            OR excluded.fifty_two_week_change_percent IS NOT NULL
            OR excluded.ex_dividend_date IS NOT NULL
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
      snapshot.averageDailyVolume10Day,
      snapshot.fiftyTwoWeekLow,
      snapshot.fiftyTwoWeekHigh,
      snapshot.fiftyTwoWeekChangePercent,
      snapshot.exDividendDate,
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

  upsertMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    db.prepare(
      `INSERT INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, average_volume_3m, fifty_two_week_low, fifty_two_week_high,
        dividend_rate, dividend_yield, ex_dividend_date, currency, exchange, full_exchange_name,
        regular_market_time, source, last_checked_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
        average_volume_3m = COALESCE(excluded.average_volume_3m, asset_market_snapshots.average_volume_3m),
        fifty_two_week_low = COALESCE(excluded.fifty_two_week_low, asset_market_snapshots.fifty_two_week_low),
        fifty_two_week_high = COALESCE(excluded.fifty_two_week_high, asset_market_snapshots.fifty_two_week_high),
        dividend_rate = COALESCE(excluded.dividend_rate, asset_market_snapshots.dividend_rate),
        dividend_yield = COALESCE(excluded.dividend_yield, asset_market_snapshots.dividend_yield),
        ex_dividend_date = COALESCE(excluded.ex_dividend_date, asset_market_snapshots.ex_dividend_date),
        currency = COALESCE(excluded.currency, asset_market_snapshots.currency),
        exchange = COALESCE(excluded.exchange, asset_market_snapshots.exchange),
        full_exchange_name = COALESCE(excluded.full_exchange_name, asset_market_snapshots.full_exchange_name),
        regular_market_time = COALESCE(excluded.regular_market_time, asset_market_snapshots.regular_market_time),
        source = excluded.source,
        last_checked_at = excluded.last_checked_at,
        updated_at = CASE
          WHEN excluded.market_state IS NOT NULL
            OR excluded.last_price IS NOT NULL
            OR excluded.day_change IS NOT NULL
            OR excluded.day_change_percent IS NOT NULL
            OR excluded.previous_close IS NOT NULL
            OR excluded.open_price IS NOT NULL
            OR excluded.day_high IS NOT NULL
            OR excluded.day_low IS NOT NULL
            OR excluded.volume IS NOT NULL
            OR excluded.average_volume_3m IS NOT NULL
            OR excluded.fifty_two_week_low IS NOT NULL
            OR excluded.fifty_two_week_high IS NOT NULL
            OR excluded.dividend_rate IS NOT NULL
            OR excluded.dividend_yield IS NOT NULL
            OR excluded.ex_dividend_date IS NOT NULL
            OR excluded.currency IS NOT NULL
            OR excluded.exchange IS NOT NULL
            OR excluded.full_exchange_name IS NOT NULL
            OR excluded.regular_market_time IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.updated_at
        END`
    ).run(
      assetId,
      marketInfo.marketState,
      marketInfo.regularMarketPrice,
      marketInfo.regularMarketChange,
      marketInfo.regularMarketChangePercent,
      marketInfo.regularMarketPreviousClose,
      marketInfo.regularMarketOpen,
      marketInfo.regularMarketDayHigh,
      marketInfo.regularMarketDayLow,
      marketInfo.regularMarketVolume,
      marketInfo.averageDailyVolume3Month,
      marketInfo.fiftyTwoWeekLow,
      marketInfo.fiftyTwoWeekHigh,
      marketInfo.dividendRate,
      marketInfo.dividendYield,
      marketInfo.exDividendDate,
      marketInfo.currency,
      marketInfo.exchangeName,
      marketInfo.exchangeName,
      marketInfo.regularMarketTime
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
      dividendYield: normalizeDividendYield(row.dividend_yield) ?? undefined
    };
  }

  readSnapshotBySymbol(symbol: string): Quote | undefined {
    const asset = assetRepository.findBySymbol(symbol.toUpperCase());
    return asset ? this.readSnapshot(asset.id) : undefined;
  }

  private snapshotWasCheckedRecently(assetId: number) {
    const row = db.prepare("SELECT last_checked_at FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as
      | { last_checked_at?: string | null }
      | undefined;
    if (!row?.last_checked_at) return false;
    const checkedAt = new Date(row.last_checked_at).getTime();
    return Number.isFinite(checkedAt) && Date.now() - checkedAt < chartConfigService.getSnapshotRefreshIntervalMs();
  }
}

export const marketSnapshotService = new MarketSnapshotService();
