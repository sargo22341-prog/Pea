import { getMarketCalendar, getSessionsForDate, type MarketCalendar, type MarketSession } from "../services/market/calendars/getMarketCalendar.js";
import type { AssetRow } from "../repositories/market/asset.repository.js";
import { getZonedDateParts, timeToMinutes, zonedTimeToUtc } from "../services/timezone/date-time.service.js";

export const MARKET_RETRY_MINUTES = 20;
export const MARKET_STOP_AFTER_MINUTES = 60;
export const CLOSE_BUFFER_MINUTES = 15;

export interface MarketAssetGroup {
  marketKey: string;
  calendar: MarketCalendar;
  assets: AssetRow[];
}

export function nowIso(date = new Date()) {
  return date.toISOString();
}

export function marketDisplayName(calendar: MarketCalendar) {
  return calendar.city === calendar.market ? calendar.city : `${calendar.city}`;
}

export function groupAssetsByMarket(assets: AssetRow[]): Map<string, MarketAssetGroup> {
  const groups = new Map<string, MarketAssetGroup>();
  for (const asset of assets) {
    const calendar = getMarketCalendar(asset.symbol, asset.exchange ?? undefined);
    const marketKey = calendar.market;
    if (!groups.has(marketKey)) groups.set(marketKey, { marketKey, calendar, assets: [] });
    groups.get(marketKey)!.assets.push(asset);
  }
  return groups;
}

export function localTradingDate(now: Date, timezone: string) {
  const local = getZonedDateParts(now, timezone);
  return {
    isoDate: local.isoDate,
    weekday: local.weekday,
    minutes: local.hour * 60 + local.minute
  };
}

export function isWeekend(weekday: string) {
  return weekday === "Sat" || weekday === "Sun";
}

export function expectedTimes(calendar: MarketCalendar, tradingDate: string) {
  const sessions = getSessionsForDate(calendar, tradingDate);
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const openExpectedAt = zonedTimeToUtc(tradingDate, first.openTime, calendar.timezone);
  const closeExpectedAt = zonedTimeToUtc(tradingDate, last.closeTime, calendar.timezone);
  const firstOpenMinutes = timeToMinutes(first.openTime);
  const lastCloseMinutes = timeToMinutes(last.closeTime);
  return { sessions, openExpectedAt, closeExpectedAt, firstOpenMinutes, lastCloseMinutes };
}

export function minutesAfter(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function serializeSessions(sessions: MarketSession[]) {
  return JSON.stringify(sessions);
}

export function serializeOverrides(calendar: MarketCalendar) {
  return calendar.dayOverrides?.length ? JSON.stringify(calendar.dayOverrides) : null;
}
