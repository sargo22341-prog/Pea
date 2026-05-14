import type { RangeKey } from "@pea/shared";
import { getZonedDateParts, timeToMinutes, zonedTimeToUtc } from "../../timezone/date-time.service.js";
import { logger } from "../../shared/logger.service.js";
import { marketDataGateway } from "../data/market-data-gateway.service.js";
import { getFinalCloseTime, getFirstOpenTime, getMarketCalendar, getSessionsForDate, type MarketCalendar } from "./getMarketCalendar.js";



export interface OpenMarketDay {
  date: string;
  period1: Date;
  period2: Date;
  calendar: MarketCalendar;
}

export interface YahooTradingDay extends OpenMarketDay {
  close: number;
  pointDate: string;
}




function getLocalDateParts(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  return { ...parts, minutes: parts.hour * 60 + parts.minute };
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return date.toISOString().slice(0, 10);
}

function tradingDayReason(symbol: string | undefined, exchange: string | undefined, date: Date, calendar: MarketCalendar) {
  const local = getLocalDateParts(date, calendar.timezone);
  if (local.weekday === "Sat" || local.weekday === "Sun") return "weekend";
  if (!isTradingDay(symbol, exchange, date)) return "closed";
  return undefined;
}

/**
 * Expose la session locale du marche pour le frontend, sans convertir les
 * timestamps API: les champs `open` et `close` sont des heures locales marche.
 */
export function getMarketSessionInfo(symbol?: string, exchange?: string) {
  const calendar = getMarketCalendar(symbol, exchange);
  const sessions = calendar.sessions;
  return {
    timezone: calendar.timezone,
    city: calendar.city,
    open: getFirstOpenTime(sessions),
    close: getFinalCloseTime(sessions),
    sessions: sessions.map((s) => ({ open: s.openTime, close: s.closeTime }))
  };
}

export function getMarketDateKey(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  return getLocalDateParts(date, calendar.timezone).isoDate;
}

export function isTradingDay(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  const local = getLocalDateParts(date, calendar.timezone);
  return local.weekday !== "Sat" && local.weekday !== "Sun";
}

/** Retourne l'ouverture marche uniquement depuis `quote.marketState` Yahoo. */
export function isMarketOpen(marketState?: string | null) {
  return String(marketState ?? "").toUpperCase() === "REGULAR";
}

export function getSessionForDate(symbol: string | undefined, exchange: string | undefined, isoDate: string): OpenMarketDay {
  const calendar = getMarketCalendar(symbol, exchange);
  const sessions = getSessionsForDate(calendar, isoDate);
  return {
    date: isoDate,
    period1: zonedTimeToUtc(isoDate, getFirstOpenTime(sessions), calendar.timezone),
    period2: zonedTimeToUtc(isoDate, getFinalCloseTime(sessions), calendar.timezone),
    calendar
  };
}

export function getLastTradingDay(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  let cursorDate = getLocalDateParts(date, calendar.timezone).isoDate;
  for (let index = 0; index < 10; index += 1) {
    const cursor = zonedTimeToUtc(cursorDate, "12:00", calendar.timezone);
    const local = getLocalDateParts(cursor, calendar.timezone);
    if (isTradingDay(symbol, exchange, cursor)) {
      const endLocal = index === 0 ? getLocalDateParts(date, calendar.timezone) : local;
      const sessions = getSessionsForDate(calendar, local.isoDate);
      if (endLocal.minutes >= timeToMinutes(getFirstOpenTime(sessions)) || index > 0) return getSessionForDate(symbol, exchange, local.isoDate);
    }
    cursorDate = addDaysToIsoDate(cursorDate, -1);
  }
  const local = getLocalDateParts(date, calendar.timezone);
  return getSessionForDate(symbol, exchange, local.isoDate);
}

/**
 * Demande a Yahoo les candles daily recentes et retourne la derniere seance
 * ayant une cloture exploitable. Pas de cache: cette fonction est reservee aux
 * jobs/constructions backend qui doivent resynchroniser la base.
 */
export async function getLastAvailableTradingDayFromYahoo(symbol: string, now = new Date(), exchange?: string): Promise<YahooTradingDay | undefined> {
  const period1 = new Date(now);
  period1.setDate(period1.getDate() - 15);
  const chart = await marketDataGateway.fetchFreshChart(symbol, { period1, period2: now, interval: "1d" });
  const valid = [...chart.quotes].reverse().find((point) => Number.isFinite(point.close) && point.close > 0);
  if (!valid) return undefined;
  const date = getMarketDateKey(symbol, exchange, new Date(valid.date));
  const session = getSessionForDate(symbol, exchange, date);
  logger.debug("market-data", "last yahoo trading day resolved", {
    symbol,
    date,
    close: valid.close,
    pointDate: valid.date,
    dailyPoints: chart.quotes.length
  });
  return { ...session, close: valid.close, pointDate: valid.date };
}

function resolveMarketInput(market: string | { symbol?: string; exchange?: string }) {
  if (typeof market === "string") return { symbol: market };
  return market;
}

const previousOpenMarketDaysCache = new Map<string, OpenMarketDay[]>();
const maxPreviousOpenMarketDaysCacheEntries = 512;

export function getPreviousOpenMarketDays(
  market: string | { symbol?: string; exchange?: string },
  endDate: Date,
  count: number
): OpenMarketDay[] {
  const { symbol, exchange } = resolveMarketInput(market);
  const calendar = getMarketCalendar(symbol, exchange);
  const endLocalDate = getLocalDateParts(endDate, calendar.timezone).isoDate;
  const cacheKey = `${calendar.market}:${calendar.timezone}:${endLocalDate}:${count}`;
  const cached = previousOpenMarketDaysCache.get(cacheKey);
  if (cached) return cached.map((day) => ({ ...day, period1: new Date(day.period1), period2: new Date(day.period2), calendar: day.calendar }));

  const days: OpenMarketDay[] = [];
  const ignored: Array<{ date: string; reason: string }> = [];
  const maxLookbackDays = Math.max(20, count * 4 + 20);
  let cursorDate = endLocalDate;

  for (let index = 0; index < maxLookbackDays && days.length < count; index += 1) {
    const cursor = zonedTimeToUtc(cursorDate, "12:00", calendar.timezone);
    const local = getLocalDateParts(cursor, calendar.timezone);
    const reason = tradingDayReason(symbol, exchange, cursor, calendar);
    if (!reason) {
      days.push(getSessionForDate(symbol, exchange, local.isoDate));
    } else {
      ignored.push({ date: local.isoDate, reason });
    }
    cursorDate = addDaysToIsoDate(cursorDate, -1);
  }

  logger.debug("market-data", "open market window resolved", {
    market: calendar.market,
    timezone: calendar.timezone,
    symbol,
    exchange,
    endDate: endDate.toISOString(),
    requestedOpenDays: count,
    returnedOpenDays: days.length,
    startDate: days[days.length - 1]?.date,
    ignoredDays: ignored
  });
  previousOpenMarketDaysCache.set(cacheKey, days);
  trimPreviousOpenMarketDaysCache();
  return days;
}

function trimPreviousOpenMarketDaysCache() {
  while (previousOpenMarketDaysCache.size > maxPreviousOpenMarketDaysCacheEntries) {
    const oldestKey = previousOpenMarketDaysCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    previousOpenMarketDaysCache.delete(oldestKey);
  }
}

export function previousOpenMarketDaysCacheStats() {
  return { previousOpenMarketDaysCacheEntries: previousOpenMarketDaysCache.size };
}

/**
 * Decide si une donnee de marche doit etre rafraichie selon la range demandee.
 *
 * @param symbol Symbole Yahoo Finance.
 * @param exchange Place de cotation optionnelle.
 * @param cacheUpdatedAt Date du cache en millisecondes.
 * @param range Range historique demandee.
 * @returns true si le cache ne couvre pas la derniere cloture estimee.
 */
export function shouldRefreshMarketData(symbol: string, exchange: string | undefined, cacheUpdatedAt: number | undefined, range: RangeKey) {
  if (!cacheUpdatedAt) return true;
  if (range === "1d" || range === "1w") return cacheUpdatedAt < getLastTradingDay(symbol, exchange).period2.getTime();
  return Date.now() - cacheUpdatedAt > 60 * 60 * 1000;
}
