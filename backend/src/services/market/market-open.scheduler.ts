/**
 * Role du fichier : detecter l'ouverture des marches et rafraichir les snapshots
 * pendant les heures de trading. Se base sur le calendrier (openTime/closeTime)
 * et non sur le marketState en base, pour eviter le blocage en etat "CLOSE" stale.
 *
 * Logique par bourse :
 *  - Skip weekend, avant openTime, apres closeTime+2h
 *  - Un seul appel Yahoo batch par bourse toutes les 5 minutes
 *  - Si Yahoo retourne CLOSE pendant 2h apres openTime → jour ferie probable, stop
 */

import { getMarketCalendar, getSessionsForDate, type MarketCalendar } from "./getMarketCalendar.js";
import { getZonedDateParts, timeToMinutes, zonedTimeToUtc } from "../timezone/date-time.service.js";
import { isMarketOpen } from "./marketCalendar.service.js";
import { assetRepository, type AssetRow } from "./asset.repository.js";
import { marketSnapshotService } from "./market-snapshot.service.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import { logger } from "../shared/logger.service.js";
import type { Quote } from "@pea/shared";
import type { YahooSnapshotPayload } from "../yahoo/yahoo.mapper.js";

const TICK_INTERVAL_MS = 5 * 60 * 1000;
const HOLIDAY_GRACE_MS = 2 * 60 * 60 * 1000;

interface MarketDayState {
  date: string;
  firstOpenSeenAt?: number;
  holidaySuspected: boolean;
  lastRefreshedAt?: number;
}

export class MarketOpenScheduler {
  private timer?: NodeJS.Timeout;
  private dayState = new Map<string, MarketDayState>();

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    void this.tick();
    logger.info("market-data", "started", { intervalMs: TICK_INTERVAL_MS });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(now = new Date()) {
    const assets = assetRepository.listTrackedAssets();
    const groups = this.groupAssetsByMarket(assets);

    for (const [marketKey, { calendar, assets: groupAssets }] of groups) {
      await this.processGroup(marketKey, calendar, groupAssets, now);
    }
  }

  private groupAssetsByMarket(assets: AssetRow[]): Map<string, { calendar: MarketCalendar; assets: AssetRow[] }> {
    const groups = new Map<string, { calendar: MarketCalendar; assets: AssetRow[] }>();
    for (const asset of assets) {
      const calendar = getMarketCalendar(asset.symbol, asset.exchange ?? undefined);
      const key = calendar.market;
      if (!groups.has(key)) groups.set(key, { calendar, assets: [] });
      groups.get(key)!.assets.push(asset);
    }
    return groups;
  }

  private async processGroup(marketKey: string, calendar: MarketCalendar, assets: AssetRow[], now: Date) {
    const local = getZonedDateParts(now, calendar.timezone);

    if (local.weekday === "Sat" || local.weekday === "Sun") {
      return;
    }

    const sessions = getSessionsForDate(calendar, local.isoDate);
    const openMinutes = timeToMinutes(sessions[0].openTime);
    const closeMinutes = timeToMinutes(sessions[sessions.length - 1].closeTime);
    const nowMinutes = local.hour * 60 + local.minute;

    if (nowMinutes < openMinutes) {
      return;
    }

    const state = this.getOrCreateDayState(marketKey, local.isoDate);

    if (state.holidaySuspected) {
      return;
    }

    const openUtc = zonedTimeToUtc(local.isoDate, sessions[0].openTime, calendar.timezone);
    const gracePeriodEnd = openUtc.getTime() + HOLIDAY_GRACE_MS;
    const afterGracePeriod = now.getTime() > gracePeriodEnd;
    const afterCloseWithBuffer = nowMinutes > closeMinutes + 120;

    if (afterCloseWithBuffer && state.firstOpenSeenAt) {
      return;
    }

    if (afterGracePeriod && !state.firstOpenSeenAt) {
      state.holidaySuspected = true;
      logger.info("market-data", "holiday suspected, stopping refresh for today", {
        market: marketKey,
        date: local.isoDate,
        openTime: sessions[0].openTime,
        timezone: calendar.timezone
      });
      return;
    }

    await this.refreshGroup(marketKey, calendar, assets, now, state);
  }

  private async refreshGroup(marketKey: string, calendar: MarketCalendar, assets: AssetRow[], now: Date, state: MarketDayState) {
    const symbols = assets.map((a) => a.symbol);

    let results: { quote: Quote; snapshot: YahooSnapshotPayload }[];
    try {
      results = await yahooApi.quoteBatchRaw(symbols);
    } catch (err) {
      logger.warn("market-data", "quoteBatchRaw failed", { market: marketKey, error: String(err) });
      return;
    }

    let anyOpen = false;
    for (const { quote, snapshot } of results) {
      const asset = assetRepository.findBySymbol(quote.symbol);
      if (!asset) continue;
      marketSnapshotService.upsertSnapshot(asset.id, snapshot);
      marketSnapshotService.invalidateCache(quote.symbol);
      if (isMarketOpen(quote.marketState)) anyOpen = true;
    }

    state.lastRefreshedAt = now.getTime();

    if (anyOpen && !state.firstOpenSeenAt) {
      state.firstOpenSeenAt = now.getTime();
      logger.info("market-data", "market open detected", { market: marketKey, symbols: symbols.length });
    }

    logger.debug("market-data", "group refreshed", {
      market: marketKey,
      symbols: symbols.length,
      anyOpen,
      timezone: calendar.timezone
    });
  }

  private getOrCreateDayState(marketKey: string, isoDate: string): MarketDayState {
    const existing = this.dayState.get(marketKey);
    if (existing && existing.date === isoDate) return existing;
    const fresh: MarketDayState = { date: isoDate, holidaySuspected: false };
    this.dayState.set(marketKey, fresh);
    return fresh;
  }
}

export const marketOpenScheduler = new MarketOpenScheduler();
