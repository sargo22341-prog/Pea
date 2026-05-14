import type { AssetMarketInfo } from "@pea/shared";
import { db } from "../../db.js";
import type { YahooSnapshotPayload } from "../../services/yahoo/yahoo.mapper.js";

export interface AssetMarketSnapshotRow {
  market_state?: string | null;
  last_price?: number | string | null;
  previous_close?: number | string | null;
  open_price?: number | string | null;
  day_high?: number | string | null;
  day_low?: number | string | null;
  day_change?: number | string | null;
  day_change_percent?: number | string | null;
  volume?: number | string | null;
  average_volume_3m?: number | string | null;
  average_volume_10d?: number | string | null;
  bid_price?: number | string | null;
  ask_price?: number | string | null;
  currency?: string | null;
  exchange?: string | null;
  full_exchange_name?: string | null;
  quote_type?: string | null;
  fifty_two_week_low?: number | string | null;
  fifty_two_week_high?: number | string | null;
  dividend_yield?: number | string | null;
  dividend_rate?: number | string | null;
  ex_dividend_date?: string | null;
  regular_market_time?: string | null;
  market_core_updated_at?: string | null;
  liquidity_updated_at?: string | null;
  range_52w_updated_at?: string | null;
  dividend_info_updated_at?: string | null;
  market_profile_updated_at?: string | null;
  updated_at: string;
  last_checked_at?: string | null;
}

export type QuoteSnapshotRow = AssetMarketSnapshotRow & {
  symbol: string;
  name: string;
};

export class MarketSnapshotRepository {
  findByAssetId(assetId: number): AssetMarketSnapshotRow | undefined {
    return db.prepare("SELECT * FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as AssetMarketSnapshotRow | undefined;
  }

  readQuoteSnapshot(assetId: number): QuoteSnapshotRow | undefined {
    return db.prepare("SELECT a.symbol, a.name, s.* FROM asset_market_snapshots s JOIN assets a ON a.id = s.asset_id WHERE s.asset_id = ?").get(assetId) as QuoteSnapshotRow | undefined;
  }

  lastCheckedAt(assetId: number): string | undefined {
    const row = db.prepare("SELECT last_checked_at FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { last_checked_at?: string | null } | undefined;
    return row?.last_checked_at ? String(row.last_checked_at) : undefined;
  }

  lastPrice(assetId: number): number | undefined {
    const row = db.prepare("SELECT last_price FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { last_price?: number } | undefined;
    const price = Number(row?.last_price);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  previousClose(assetId: number): number | undefined {
    const row = db.prepare("SELECT previous_close FROM asset_market_snapshots WHERE asset_id = ?").get(assetId) as { previous_close?: number } | undefined;
    const price = Number(row?.previous_close);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    db.prepare(
      `INSERT INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size, average_volume_3m,
        average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date,
        dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield, currency, exchange,
        full_exchange_name, quote_type, regular_market_time, source, last_checked_at,
        market_core_updated_at, liquidity_updated_at, range_52w_updated_at, dividend_info_updated_at, market_profile_updated_at,
        updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP)
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
        market_core_updated_at = CASE
          WHEN (excluded.market_state IS NOT NULL AND excluded.market_state IS NOT asset_market_snapshots.market_state)
            OR excluded.last_price IS NOT NULL
            OR excluded.day_change IS NOT NULL
            OR excluded.day_change_percent IS NOT NULL
            OR excluded.previous_close IS NOT NULL
            OR excluded.open_price IS NOT NULL
            OR excluded.day_high IS NOT NULL
            OR excluded.day_low IS NOT NULL
            OR excluded.regular_market_time IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.market_core_updated_at
        END,
        liquidity_updated_at = CASE
          WHEN excluded.volume IS NOT NULL
            OR excluded.bid_price IS NOT NULL
            OR excluded.ask_price IS NOT NULL
            OR excluded.bid_size IS NOT NULL
            OR excluded.ask_size IS NOT NULL
            OR excluded.average_volume_3m IS NOT NULL
            OR excluded.average_volume_10d IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.liquidity_updated_at
        END,
        range_52w_updated_at = CASE
          WHEN excluded.fifty_two_week_low IS NOT NULL
            OR excluded.fifty_two_week_high IS NOT NULL
            OR excluded.fifty_two_week_change_percent IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.range_52w_updated_at
        END,
        dividend_info_updated_at = CASE
          WHEN excluded.ex_dividend_date IS NOT NULL
            OR excluded.dividend_rate IS NOT NULL
            OR excluded.dividend_yield IS NOT NULL
            OR excluded.trailing_annual_dividend_rate IS NOT NULL
            OR excluded.trailing_annual_dividend_yield IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.dividend_info_updated_at
        END,
        market_profile_updated_at = CASE
          WHEN excluded.currency IS NOT NULL
            OR excluded.exchange IS NOT NULL
            OR excluded.full_exchange_name IS NOT NULL
            OR excluded.quote_type IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.market_profile_updated_at
        END,
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
  }

  updateAssetFromSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    db.prepare(
      `UPDATE assets SET
        name = COALESCE(?, ?, name),
        exchange = COALESCE(?, exchange),
        currency = COALESCE(?, currency),
        quote_type = COALESCE(?, quote_type),
        type_disp = COALESCE(?, type_disp),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(snapshot.longName, snapshot.shortName, snapshot.exchange ?? snapshot.fullExchangeName, snapshot.currency, snapshot.quoteType, snapshot.typeDisp, assetId);
  }

  upsertMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    db.prepare(
      `INSERT INTO asset_market_snapshots (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, average_volume_3m, fifty_two_week_low, fifty_two_week_high,
        dividend_rate, dividend_yield, ex_dividend_date, currency, exchange, full_exchange_name,
        regular_market_time, source, last_checked_at,
        market_core_updated_at, liquidity_updated_at, range_52w_updated_at, dividend_info_updated_at, market_profile_updated_at,
        updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP)
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
        market_core_updated_at = CASE
          WHEN excluded.market_state IS NOT NULL
            OR excluded.last_price IS NOT NULL
            OR excluded.day_change IS NOT NULL
            OR excluded.day_change_percent IS NOT NULL
            OR excluded.previous_close IS NOT NULL
            OR excluded.open_price IS NOT NULL
            OR excluded.day_high IS NOT NULL
            OR excluded.day_low IS NOT NULL
            OR excluded.regular_market_time IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.market_core_updated_at
        END,
        liquidity_updated_at = CASE
          WHEN excluded.volume IS NOT NULL
            OR excluded.average_volume_3m IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.liquidity_updated_at
        END,
        range_52w_updated_at = CASE
          WHEN excluded.fifty_two_week_low IS NOT NULL
            OR excluded.fifty_two_week_high IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.range_52w_updated_at
        END,
        dividend_info_updated_at = CASE
          WHEN excluded.dividend_rate IS NOT NULL
            OR excluded.dividend_yield IS NOT NULL
            OR excluded.ex_dividend_date IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.dividend_info_updated_at
        END,
        market_profile_updated_at = CASE
          WHEN excluded.currency IS NOT NULL
            OR excluded.exchange IS NOT NULL
            OR excluded.full_exchange_name IS NOT NULL
          THEN excluded.updated_at
          ELSE asset_market_snapshots.market_profile_updated_at
        END,
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
}

export const marketSnapshotRepository = new MarketSnapshotRepository();
