import type { AssetMarketInfo } from "@pea/shared";
import { db } from "../../db.js";
import type { YahooSnapshotPayload } from "../../services/yahoo/yahoo.mapper.js";
import { marketSnapshotWriterRepository } from "./market-snapshot-writer.repository.js";

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

  upsertSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    marketSnapshotWriterRepository.upsertSnapshot(assetId, snapshot);
  }

  upsertMarketInfo(assetId: number, marketInfo: AssetMarketInfo) {
    marketSnapshotWriterRepository.upsertMarketInfo(assetId, marketInfo);
  }

  updateAssetFromSnapshot(assetId: number, snapshot: YahooSnapshotPayload) {
    marketSnapshotWriterRepository.updateAssetFromSnapshot(assetId, snapshot);
  }
}

export const marketSnapshotRepository = new MarketSnapshotRepository();
