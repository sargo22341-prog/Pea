import type { PortfolioChartDto, RangeKey } from "@pea/shared";
import { db } from "../../db.js";

export interface PortfolioTransactionMarkerRow {
  id: number | string;
  position_id: number | string;
  type: "buy" | "sell";
  quantity: number | string;
  price: number | string | null;
  traded_at: string;
  symbol: string;
  position_name: string;
  asset_row_id?: number | string | null;
  asset_name?: string | null;
}

export class PortfolioChartRepository {
  readChartCache(cacheKey: string, nowMs: number): PortfolioChartDto | undefined {
    const row = db.prepare(
      "SELECT payload FROM portfolio_chart_cache WHERE cache_key = ? AND expires_at > ?"
    ).get(cacheKey, nowMs) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as PortfolioChartDto : undefined;
  }

  upsertChartCache(input: { cacheKey: string; userId: string; range: RangeKey; payload: PortfolioChartDto; cachedAt: number; expiresAt: number }) {
    db.prepare(
      `INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at, expires_at = excluded.expires_at`
    ).run(input.cacheKey, input.userId, input.range, JSON.stringify({ ...input.payload, expiresAt: input.expiresAt }), input.cachedAt, input.expiresAt);
  }

  listTransactionMarkers(userId: string | number): PortfolioTransactionMarkerRow[] {
    return db
      .prepare(
        `SELECT
           t.id,
           t.position_id,
           t.type,
           t.quantity,
           t.price,
           t.traded_at,
           p.symbol,
           p.name AS position_name,
           a.id AS asset_row_id,
           a.name AS asset_name
         FROM transactions t
         JOIN positions p ON p.id = t.position_id
         LEFT JOIN assets a ON a.symbol = p.symbol
         WHERE t.traded_at IS NOT NULL
           AND t.type IN ('buy', 'sell')
           AND p.user_id = ?
         ORDER BY t.traded_at ASC, t.id ASC`
      )
      .all(userId) as PortfolioTransactionMarkerRow[];
  }
}

export const portfolioChartRepository = new PortfolioChartRepository();
