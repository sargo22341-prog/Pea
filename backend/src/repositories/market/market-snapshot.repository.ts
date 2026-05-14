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

/**
 * Champs SELECT exposés par la vue logique `asset_market_snapshots` après split (migration 028).
 *
 * Le split physique `asset_quote_snapshot / asset_quote_range / asset_dividend_snapshot` est
 * masqué derrière un LEFT JOIN qui reproduit le contrat de l'ancienne mega-table — chaque
 * sous-table porte son propre `updated_at`, exposé sous des alias `*_updated_at` pour la
 * compatibilité avec les services consommateurs.
 *
 * Pour les écritures, on dispatche selon le type d'update : un upsert "quote" ne touche pas
 * `asset_quote_range` ni `asset_dividend_snapshot`. Plus de CASE WHEN gigantesques sur 5
 * timestamps : chaque table met à jour son seul `updated_at` au moment de l'écriture.
 */
const SNAPSHOT_SELECT = `
  q.market_state,
  q.last_price,
  q.day_change,
  q.day_change_percent,
  q.previous_close,
  q.open_price,
  q.day_high,
  q.day_low,
  q.volume,
  q.bid_price,
  q.ask_price,
  q.bid_size,
  q.ask_size,
  q.regular_market_time,
  q.currency,
  q.exchange,
  q.full_exchange_name,
  q.quote_type,
  q.source,
  q.last_checked_at,
  r.fifty_two_week_low,
  r.fifty_two_week_high,
  r.fifty_two_week_change_percent,
  r.average_volume_3m,
  r.average_volume_10d,
  d.ex_dividend_date,
  d.dividend_rate,
  d.dividend_yield,
  d.trailing_annual_dividend_rate,
  d.trailing_annual_dividend_yield,
  q.updated_at AS market_core_updated_at,
  q.updated_at AS liquidity_updated_at,
  r.updated_at AS range_52w_updated_at,
  d.updated_at AS dividend_info_updated_at,
  q.updated_at AS market_profile_updated_at,
  COALESCE(q.updated_at, r.updated_at, d.updated_at) AS updated_at
`;

const SNAPSHOT_FROM = `
  asset_quote_snapshot q
  LEFT JOIN asset_quote_range r ON r.asset_id = q.asset_id
  LEFT JOIN asset_dividend_snapshot d ON d.asset_id = q.asset_id
`;

export class MarketSnapshotRepository {
  findByAssetId(assetId: number): AssetMarketSnapshotRow | undefined {
    return db
      .prepare(`SELECT ${SNAPSHOT_SELECT} FROM ${SNAPSHOT_FROM} WHERE q.asset_id = ?`)
      .get(assetId) as AssetMarketSnapshotRow | undefined;
  }

  readQuoteSnapshot(assetId: number): QuoteSnapshotRow | undefined {
    return db
      .prepare(
        `SELECT a.symbol, a.name, ${SNAPSHOT_SELECT}
         FROM ${SNAPSHOT_FROM}
         JOIN assets a ON a.id = q.asset_id
         WHERE q.asset_id = ?`
      )
      .get(assetId) as QuoteSnapshotRow | undefined;
  }

  lastCheckedAt(assetId: number): string | undefined {
    const row = db.prepare("SELECT last_checked_at FROM asset_quote_snapshot WHERE asset_id = ?").get(assetId) as { last_checked_at?: string | null } | undefined;
    return row?.last_checked_at ? String(row.last_checked_at) : undefined;
  }

  lastPrice(assetId: number): number | undefined {
    const row = db.prepare("SELECT last_price FROM asset_quote_snapshot WHERE asset_id = ?").get(assetId) as { last_price?: number } | undefined;
    const price = Number(row?.last_price);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  previousClose(assetId: number): number | undefined {
    const row = db.prepare("SELECT previous_close FROM asset_quote_snapshot WHERE asset_id = ?").get(assetId) as { previous_close?: number } | undefined;
    const price = Number(row?.previous_close);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  /**
   * Upsert complet (snapshot Yahoo brut). Distribue les colonnes vers les 3 tables et fait
   * 3 INSERT/ON CONFLICT distincts. Chaque table indépendante met à jour son `updated_at`.
   */
  upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    this.upsertQuoteCore(assetId, snapshot);
    this.upsertRangeData(assetId, snapshot);
    this.upsertDividendData(assetId, snapshot);
  }

  /** Upsert "marketInfo" (subset issu de quoteSummary). Pareil mais avec moins de champs. */
  upsertMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    this.upsertQuoteCoreFromMarketInfo(assetId, marketInfo);
    this.upsertRangeDataFromMarketInfo(assetId, marketInfo);
    this.upsertDividendDataFromMarketInfo(assetId, marketInfo);
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

  private upsertQuoteCore(assetId: number, snapshot: YahooSnapshotPayload) {
    db.prepare(
      `INSERT INTO asset_quote_snapshot (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, bid_price, ask_price, bid_size, ask_size, regular_market_time,
        currency, exchange, full_exchange_name, quote_type, source, last_checked_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(asset_id) DO UPDATE SET
        market_state = COALESCE(excluded.market_state, asset_quote_snapshot.market_state),
        last_price = COALESCE(excluded.last_price, asset_quote_snapshot.last_price),
        day_change = COALESCE(excluded.day_change, asset_quote_snapshot.day_change),
        day_change_percent = COALESCE(excluded.day_change_percent, asset_quote_snapshot.day_change_percent),
        previous_close = COALESCE(excluded.previous_close, asset_quote_snapshot.previous_close),
        open_price = COALESCE(excluded.open_price, asset_quote_snapshot.open_price),
        day_high = COALESCE(excluded.day_high, asset_quote_snapshot.day_high),
        day_low = COALESCE(excluded.day_low, asset_quote_snapshot.day_low),
        volume = COALESCE(excluded.volume, asset_quote_snapshot.volume),
        bid_price = COALESCE(excluded.bid_price, asset_quote_snapshot.bid_price),
        ask_price = COALESCE(excluded.ask_price, asset_quote_snapshot.ask_price),
        bid_size = COALESCE(excluded.bid_size, asset_quote_snapshot.bid_size),
        ask_size = COALESCE(excluded.ask_size, asset_quote_snapshot.ask_size),
        regular_market_time = COALESCE(excluded.regular_market_time, asset_quote_snapshot.regular_market_time),
        currency = COALESCE(excluded.currency, asset_quote_snapshot.currency),
        exchange = COALESCE(excluded.exchange, asset_quote_snapshot.exchange),
        full_exchange_name = COALESCE(excluded.full_exchange_name, asset_quote_snapshot.full_exchange_name),
        quote_type = COALESCE(excluded.quote_type, asset_quote_snapshot.quote_type),
        source = excluded.source,
        last_checked_at = excluded.last_checked_at,
        updated_at = CASE
          WHEN (excluded.market_state IS NOT NULL AND excluded.market_state IS NOT asset_quote_snapshot.market_state)
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
            OR excluded.regular_market_time IS NOT NULL
            OR excluded.currency IS NOT NULL
            OR excluded.exchange IS NOT NULL
            OR excluded.full_exchange_name IS NOT NULL
            OR excluded.quote_type IS NOT NULL
          THEN CURRENT_TIMESTAMP
          ELSE asset_quote_snapshot.updated_at
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
      snapshot.regularMarketTime,
      snapshot.currency,
      snapshot.exchange,
      snapshot.fullExchangeName,
      snapshot.quoteType
    );
  }

  private upsertRangeData(assetId: number, snapshot: YahooSnapshotPayload) {
    if (
      snapshot.fiftyTwoWeekLow == null &&
      snapshot.fiftyTwoWeekHigh == null &&
      snapshot.fiftyTwoWeekChangePercent == null &&
      snapshot.averageDailyVolume3Month == null &&
      snapshot.averageDailyVolume10Day == null
    ) return;
    db.prepare(
      `INSERT INTO asset_quote_range (
        asset_id, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent,
        average_volume_3m, average_volume_10d, source, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP)
      ON CONFLICT(asset_id) DO UPDATE SET
        fifty_two_week_low = COALESCE(excluded.fifty_two_week_low, asset_quote_range.fifty_two_week_low),
        fifty_two_week_high = COALESCE(excluded.fifty_two_week_high, asset_quote_range.fifty_two_week_high),
        fifty_two_week_change_percent = COALESCE(excluded.fifty_two_week_change_percent, asset_quote_range.fifty_two_week_change_percent),
        average_volume_3m = COALESCE(excluded.average_volume_3m, asset_quote_range.average_volume_3m),
        average_volume_10d = COALESCE(excluded.average_volume_10d, asset_quote_range.average_volume_10d),
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP`
    ).run(
      assetId,
      snapshot.fiftyTwoWeekLow,
      snapshot.fiftyTwoWeekHigh,
      snapshot.fiftyTwoWeekChangePercent,
      snapshot.averageDailyVolume3Month,
      snapshot.averageDailyVolume10Day
    );
  }

  private upsertDividendData(assetId: number, snapshot: YahooSnapshotPayload) {
    if (
      snapshot.exDividendDate == null &&
      snapshot.dividendRate == null &&
      snapshot.dividendYield == null &&
      snapshot.trailingAnnualDividendRate == null &&
      snapshot.trailingAnnualDividendYield == null
    ) return;
    db.prepare(
      `INSERT INTO asset_dividend_snapshot (
        asset_id, ex_dividend_date, dividend_rate, dividend_yield,
        trailing_annual_dividend_rate, trailing_annual_dividend_yield, source, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP)
      ON CONFLICT(asset_id) DO UPDATE SET
        ex_dividend_date = COALESCE(excluded.ex_dividend_date, asset_dividend_snapshot.ex_dividend_date),
        dividend_rate = COALESCE(excluded.dividend_rate, asset_dividend_snapshot.dividend_rate),
        dividend_yield = COALESCE(excluded.dividend_yield, asset_dividend_snapshot.dividend_yield),
        trailing_annual_dividend_rate = COALESCE(excluded.trailing_annual_dividend_rate, asset_dividend_snapshot.trailing_annual_dividend_rate),
        trailing_annual_dividend_yield = COALESCE(excluded.trailing_annual_dividend_yield, asset_dividend_snapshot.trailing_annual_dividend_yield),
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP`
    ).run(
      assetId,
      snapshot.exDividendDate,
      snapshot.dividendRate,
      snapshot.dividendYield,
      snapshot.trailingAnnualDividendRate,
      snapshot.trailingAnnualDividendYield
    );
  }

  private upsertQuoteCoreFromMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    db.prepare(
      `INSERT INTO asset_quote_snapshot (
        asset_id, market_state, last_price, day_change, day_change_percent, previous_close, open_price,
        day_high, day_low, volume, regular_market_time, currency, exchange, full_exchange_name,
        source, last_checked_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(asset_id) DO UPDATE SET
        market_state = COALESCE(excluded.market_state, asset_quote_snapshot.market_state),
        last_price = COALESCE(excluded.last_price, asset_quote_snapshot.last_price),
        day_change = COALESCE(excluded.day_change, asset_quote_snapshot.day_change),
        day_change_percent = COALESCE(excluded.day_change_percent, asset_quote_snapshot.day_change_percent),
        previous_close = COALESCE(excluded.previous_close, asset_quote_snapshot.previous_close),
        open_price = COALESCE(excluded.open_price, asset_quote_snapshot.open_price),
        day_high = COALESCE(excluded.day_high, asset_quote_snapshot.day_high),
        day_low = COALESCE(excluded.day_low, asset_quote_snapshot.day_low),
        volume = COALESCE(excluded.volume, asset_quote_snapshot.volume),
        regular_market_time = COALESCE(excluded.regular_market_time, asset_quote_snapshot.regular_market_time),
        currency = COALESCE(excluded.currency, asset_quote_snapshot.currency),
        exchange = COALESCE(excluded.exchange, asset_quote_snapshot.exchange),
        full_exchange_name = COALESCE(excluded.full_exchange_name, asset_quote_snapshot.full_exchange_name),
        source = excluded.source,
        last_checked_at = excluded.last_checked_at,
        updated_at = CURRENT_TIMESTAMP`
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
      marketInfo.regularMarketTime,
      marketInfo.currency,
      marketInfo.exchangeName,
      marketInfo.exchangeName
    );
  }

  private upsertRangeDataFromMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    if (
      marketInfo.fiftyTwoWeekLow == null &&
      marketInfo.fiftyTwoWeekHigh == null &&
      marketInfo.averageDailyVolume3Month == null
    ) return;
    db.prepare(
      `INSERT INTO asset_quote_range (asset_id, fifty_two_week_low, fifty_two_week_high, average_volume_3m, source, updated_at)
       VALUES (?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP)
       ON CONFLICT(asset_id) DO UPDATE SET
         fifty_two_week_low = COALESCE(excluded.fifty_two_week_low, asset_quote_range.fifty_two_week_low),
         fifty_two_week_high = COALESCE(excluded.fifty_two_week_high, asset_quote_range.fifty_two_week_high),
         average_volume_3m = COALESCE(excluded.average_volume_3m, asset_quote_range.average_volume_3m),
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`
    ).run(assetId, marketInfo.fiftyTwoWeekLow, marketInfo.fiftyTwoWeekHigh, marketInfo.averageDailyVolume3Month);
  }

  private upsertDividendDataFromMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    if (marketInfo.exDividendDate == null && marketInfo.dividendRate == null && marketInfo.dividendYield == null) return;
    db.prepare(
      `INSERT INTO asset_dividend_snapshot (asset_id, ex_dividend_date, dividend_rate, dividend_yield, source, updated_at)
       VALUES (?, ?, ?, ?, 'yahoo-finance2', CURRENT_TIMESTAMP)
       ON CONFLICT(asset_id) DO UPDATE SET
         ex_dividend_date = COALESCE(excluded.ex_dividend_date, asset_dividend_snapshot.ex_dividend_date),
         dividend_rate = COALESCE(excluded.dividend_rate, asset_dividend_snapshot.dividend_rate),
         dividend_yield = COALESCE(excluded.dividend_yield, asset_dividend_snapshot.dividend_yield),
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`
    ).run(assetId, marketInfo.exDividendDate, marketInfo.dividendRate, marketInfo.dividendYield);
  }
}

export const marketSnapshotRepository = new MarketSnapshotRepository();
