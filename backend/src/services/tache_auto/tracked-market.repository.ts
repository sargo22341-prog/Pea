import { db } from "../../db.js";
import { assetRepository } from "../market/asset.repository.js";
import type { MarketCalendar } from "../market/getMarketCalendar.js";
import { groupAssetsByMarket, marketDisplayName, nowIso, serializeOverrides, serializeSessions, type MarketAssetGroup } from "./market-task.utils.js";

export interface TrackedMarketRow {
  id: number;
  market_key: string;
  display_name: string;
  timezone: string;
  sessions_json: string;
  overrides_json?: string | null;
  assets_count: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export class TrackedMarketRepository {
  syncFromTrackedAssets(): Map<string, MarketAssetGroup> {
    const groups = groupAssetsByMarket(assetRepository.listTrackedAssets());
    const seen = new Set(groups.keys());
    const timestamp = nowIso();

    for (const group of groups.values()) {
      this.upsert(group.calendar, group.assets.length, true, timestamp);
    }

    const existing = this.listAll();
    for (const market of existing) {
      if (!seen.has(market.market_key) && market.assets_count !== 0) {
        db.prepare("UPDATE tracked_markets SET assets_count = 0, enabled = 0, updated_at = ? WHERE market_key = ?").run(timestamp, market.market_key);
      }
    }

    return groups;
  }

  upsert(calendar: MarketCalendar, assetsCount: number, enabled = true, timestamp = nowIso()) {
    db.prepare(
      `INSERT INTO tracked_markets (market_key, display_name, timezone, sessions_json, overrides_json, assets_count, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_key) DO UPDATE SET
         display_name = excluded.display_name,
         timezone = excluded.timezone,
         sessions_json = excluded.sessions_json,
         overrides_json = excluded.overrides_json,
         assets_count = excluded.assets_count,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`
    ).run(
      calendar.market,
      marketDisplayName(calendar),
      calendar.timezone,
      serializeSessions(calendar.sessions),
      serializeOverrides(calendar),
      assetsCount,
      enabled ? 1 : 0,
      timestamp,
      timestamp
    );
  }

  listActive(): TrackedMarketRow[] {
    return db.prepare("SELECT * FROM tracked_markets WHERE enabled = 1 AND assets_count > 0 ORDER BY display_name ASC").all() as TrackedMarketRow[];
  }

  listAll(): TrackedMarketRow[] {
    return db.prepare("SELECT * FROM tracked_markets ORDER BY display_name ASC").all() as TrackedMarketRow[];
  }

  removeUnused(marketKey: string) {
    this.syncFromTrackedAssets();
    const market = db.prepare("SELECT * FROM tracked_markets WHERE market_key = ?").get(marketKey) as TrackedMarketRow | undefined;
    if (!market) return { removed: false, reason: "not_found" as const };
    if (market.assets_count > 0 || market.enabled) return { removed: false, reason: "has_assets" as const };

    const runs = db.prepare("DELETE FROM market_daily_runs WHERE market_key = ?").run(marketKey);
    const logs = db.prepare("DELETE FROM market_check_logs WHERE market_key = ?").run(marketKey);
    const markets = db.prepare("DELETE FROM tracked_markets WHERE market_key = ?").run(marketKey);

    return { removed: true, cleanup: { markets, runs, logs } };
  }
}

export const trackedMarketRepository = new TrackedMarketRepository();
