import { db } from "../../db.js";
import type { YahooAssetProfilePayload } from "../../services/yahoo/yahoo.api.js";
import type { YahooSnapshotPayload } from "../../services/yahoo/yahoo.mapper.js";

export interface AssetRow {
  id: number;
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  quote_type?: string;
  type_disp?: string;
}

export interface AssetProfileRow {
  country?: string | null;
  sector?: string | null;
}

type AssetDbRow = {
  id: number | string;
  symbol: string;
  name: string;
  exchange?: string | null;
  currency?: string | null;
  quote_type?: string | null;
  type_disp?: string | null;
};

function mapAsset(row: AssetDbRow): AssetRow {
  return {
    id: Number(row.id),
    symbol: String(row.symbol),
    name: String(row.name),
    exchange: row.exchange ?? undefined,
    currency: row.currency ?? undefined,
    quote_type: row.quote_type ?? undefined,
    type_disp: row.type_disp ?? undefined
  };
}

export class AssetRepository {
  findBySymbol(symbol: string): AssetRow | undefined {
    const row = db.prepare("SELECT * FROM assets WHERE symbol = ?").get(symbol.toUpperCase()) as AssetDbRow | undefined;
    return row ? mapAsset(row) : undefined;
  }

  findById(assetId: number): AssetRow | undefined {
    const row = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as AssetDbRow | undefined;
    return row ? mapAsset(row) : undefined;
  }

  profileByAssetId(assetId: number): AssetProfileRow | undefined {
    return db.prepare("SELECT country, sector FROM asset_profiles WHERE asset_id = ?").get(assetId) as AssetProfileRow | undefined;
  }

  listTrackedAssets(): AssetRow[] {
    const rows = db
      .prepare(
        `SELECT DISTINCT a.*
         FROM assets a
         WHERE a.symbol IN (SELECT symbol FROM positions)
            OR a.symbol IN (SELECT symbol FROM watchlist)
         ORDER BY a.symbol ASC`
      )
      .all() as AssetDbRow[];
    return rows.map(mapAsset);
  }

  listTrackedSymbols(): string[] {
    const rows = db
      .prepare(
        `SELECT symbol FROM positions
         UNION
         SELECT symbol FROM watchlist
         ORDER BY symbol ASC`
      )
      .all() as Array<{ symbol: string }>;
    return rows.map((row) => String(row.symbol).toUpperCase());
  }

  upsertFromQuote(snapshot: YahooSnapshotPayload): AssetRow {
    const name = snapshot.longName ?? snapshot.shortName ?? snapshot.symbol;
    db.prepare(
      `INSERT INTO assets (symbol, name, exchange, currency, quote_type, type_disp)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         name = COALESCE(excluded.name, assets.name),
         exchange = COALESCE(excluded.exchange, assets.exchange),
         currency = COALESCE(excluded.currency, assets.currency),
         quote_type = COALESCE(excluded.quote_type, assets.quote_type),
         type_disp = COALESCE(excluded.type_disp, assets.type_disp),
         updated_at = CURRENT_TIMESTAMP`
    ).run(snapshot.symbol, name, snapshot.exchange ?? snapshot.fullExchangeName, snapshot.currency, snapshot.quoteType, snapshot.typeDisp);
    return this.findBySymbol(snapshot.symbol)!;
  }

  upsertProfile(assetId: number, profile: YahooAssetProfilePayload) {
    db.prepare(
      `INSERT INTO asset_profiles (asset_id, country, sector, industry, website, long_business_summary, full_time_employees, market_cap, beta, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'yahoo-finance2')
       ON CONFLICT(asset_id) DO UPDATE SET
         country = COALESCE(excluded.country, asset_profiles.country),
         sector = COALESCE(excluded.sector, asset_profiles.sector),
         industry = COALESCE(excluded.industry, asset_profiles.industry),
         website = COALESCE(excluded.website, asset_profiles.website),
         long_business_summary = COALESCE(excluded.long_business_summary, asset_profiles.long_business_summary),
         full_time_employees = COALESCE(excluded.full_time_employees, asset_profiles.full_time_employees),
         market_cap = COALESCE(excluded.market_cap, asset_profiles.market_cap),
         beta = COALESCE(excluded.beta, asset_profiles.beta),
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`
    ).run(assetId, profile.country, profile.sector, profile.industry, profile.website, profile.longBusinessSummary, profile.fullTimeEmployees, profile.marketCap, profile.beta);
  }
}

export const assetRepository = new AssetRepository();
