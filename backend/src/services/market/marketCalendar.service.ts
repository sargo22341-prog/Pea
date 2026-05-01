/**
 * Rôle du fichier : décrire les calendriers de marché utilisés par le backend
 * pour décider quand rafraîchir les caches financiers.
 */

import holidays from "../../data/market-holidays.json" with { type: "json" };
import type { RangeKey } from "@pea/shared";
import { getZonedDateParts, timeToMinutes, zonedTimeToUtc } from "../timezone/date-time.service.js";
import { logger } from "../shared/logger.service.js";

export interface MarketCalendar {
  market: "euronext" | "italy" | "xetra" | "madrid" | "london" | "us" | "toronto" | "fallback";
  timezone: string;
  city: string;
  openTime: string;
  closeTime: string;
  holidays: string[];
  earlyCloses: Record<string, string>;
}

export interface OpenMarketDay {
  date: string;
  period1: Date;
  period2: Date;
  calendar: MarketCalendar;
}

const defaultHours = {
  timezone: "Europe/Paris",
  city: "Paris",
  openTime: "09:00",
  closeTime: "17:30"
};

function normalizeMarketInput(symbol?: string, exchange?: string) {
  return `${symbol ?? ""} ${exchange ?? ""}`.toUpperCase();
}

function holidayList(market: "euronext" | "us") {
  const data = holidays[market];
  return Object.values(data.holidays).flat();
}

export function getMarketCalendar(symbol?: string, exchange?: string): MarketCalendar {
  const input = normalizeMarketInput(symbol, exchange);
  if (input.includes(".PA") || input.includes(".AS") || input.includes(".BR") || input.includes(".LS") || input.includes("EURONEXT") || input.includes("PARIS") || input.includes("AMSTERDAM") || input.includes("BRUSSELS") || input.includes("LISBON")) {
    const timezone = input.includes(".AS") || input.includes("AMSTERDAM") ? "Europe/Amsterdam" : input.includes(".BR") || input.includes("BRUSSELS") ? "Europe/Brussels" : input.includes(".LS") || input.includes("LISBON") ? "Europe/Lisbon" : "Europe/Paris";
    const city = timezone === "Europe/Amsterdam" ? "Amsterdam" : timezone === "Europe/Brussels" ? "Brussels" : timezone === "Europe/Lisbon" ? "Lisbon" : "Paris";
    return {
      market: "euronext",
      timezone,
      city,
      openTime: timezone === "Europe/Lisbon" ? "08:00" : "09:00",
      closeTime: timezone === "Europe/Lisbon" ? "16:30" : "17:30",
      holidays: holidayList("euronext"),
      earlyCloses: {}
    };
  }
  if (input.includes(".MI") || input.includes("MILAN") || input.includes("ITALIANA")) return { market: "italy", timezone: "Europe/Rome", city: "Milan", openTime: "09:00", closeTime: "17:30", holidays: [], earlyCloses: {} };
  if (input.includes(".DE") || input.includes("XETRA") || input.includes("FRANKFURT")) return { market: "xetra", timezone: "Europe/Berlin", city: "Frankfurt", openTime: "09:00", closeTime: "17:30", holidays: [], earlyCloses: {} };
  if (input.includes(".MC") || input.includes("MADRID")) return { market: "madrid", timezone: "Europe/Madrid", city: "Madrid", openTime: "09:00", closeTime: "17:30", holidays: [], earlyCloses: {} };
  if (input.includes(".L") || input.includes("LONDON")) return { market: "london", timezone: "Europe/London", city: "London", openTime: "08:00", closeTime: "16:30", holidays: [], earlyCloses: {} };
  if (input.includes(".TO") || input.includes("TORONTO")) return { market: "toronto", timezone: "America/Toronto", city: "Toronto", openTime: "09:30", closeTime: "16:00", holidays: [], earlyCloses: {} };
  if (!String(symbol ?? "").includes(".") || input.includes("NASDAQ") || input.includes("NYSE") || input.includes("AMEX") || input.includes("NEW YORK")) {
    return { market: "us", timezone: "America/New_York", city: "New York", openTime: "09:30", closeTime: "16:00", holidays: holidayList("us"), earlyCloses: holidays.us.earlyCloses };
  }
  return { market: "fallback", holidays: [], earlyCloses: {}, ...defaultHours };
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
  if (calendar.holidays.includes(local.isoDate)) return "holiday";
  if (!isTradingDay(symbol, exchange, date)) return "closed";
  return undefined;
}

/**
 * Expose la session locale du marche pour le frontend, sans convertir les
 * timestamps API: les champs `open` et `close` sont des heures locales marche.
 */
export function getMarketSessionInfo(symbol?: string, exchange?: string) {
  const calendar = getMarketCalendar(symbol, exchange);
  return {
    timezone: calendar.timezone,
    city: calendar.city,
    open: calendar.openTime,
    close: calendar.closeTime
  };
}

export function getMarketDateKey(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  return getLocalDateParts(date, calendar.timezone).isoDate;
}

export function isTradingDay(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  const local = getLocalDateParts(date, calendar.timezone);
  return local.weekday !== "Sat" && local.weekday !== "Sun" && !calendar.holidays.includes(local.isoDate);
}

export function isMarketOpen(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  if (!isTradingDay(symbol, exchange, date)) return false;
  const local = getLocalDateParts(date, calendar.timezone);
  const closeTime = calendar.earlyCloses[local.isoDate] ?? calendar.closeTime;
  return local.minutes >= timeToMinutes(calendar.openTime) && local.minutes < timeToMinutes(closeTime);
}

export function getLastTradingDay(symbol?: string, exchange?: string, date = new Date()) {
  const calendar = getMarketCalendar(symbol, exchange);
  let cursorDate = getLocalDateParts(date, calendar.timezone).isoDate;
  for (let index = 0; index < 10; index += 1) {
    const cursor = zonedTimeToUtc(cursorDate, "12:00", calendar.timezone);
    const local = getLocalDateParts(cursor, calendar.timezone);
    const closeTime = calendar.earlyCloses[local.isoDate] ?? calendar.closeTime;
    if (isTradingDay(symbol, exchange, cursor)) {
      const endLocal = index === 0 ? getLocalDateParts(date, calendar.timezone) : local;
      if (endLocal.minutes >= timeToMinutes(calendar.openTime) || index > 0) {
        return {
          date: local.isoDate,
          period1: zonedTimeToUtc(local.isoDate, calendar.openTime, calendar.timezone),
          period2: zonedTimeToUtc(local.isoDate, closeTime, calendar.timezone),
          calendar
        };
      }
    }
    cursorDate = addDaysToIsoDate(cursorDate, -1);
  }
  const local = getLocalDateParts(date, calendar.timezone);
  return {
    date: local.isoDate,
    period1: zonedTimeToUtc(local.isoDate, calendar.openTime, calendar.timezone),
    period2: zonedTimeToUtc(local.isoDate, calendar.closeTime, calendar.timezone),
    calendar
  };
}

function resolveMarketInput(market: string | { symbol?: string; exchange?: string }) {
  if (typeof market === "string") return { symbol: market };
  return market;
}

export function getPreviousOpenMarketDays(
  market: string | { symbol?: string; exchange?: string },
  endDate: Date,
  count: number
): OpenMarketDay[] {
  const { symbol, exchange } = resolveMarketInput(market);
  const calendar = getMarketCalendar(symbol, exchange);
  const days: OpenMarketDay[] = [];
  const ignored: Array<{ date: string; reason: string }> = [];
  const maxLookbackDays = Math.max(20, count * 4 + 20);
  let cursorDate = getLocalDateParts(endDate, calendar.timezone).isoDate;

  for (let index = 0; index < maxLookbackDays && days.length < count; index += 1) {
    const cursor = zonedTimeToUtc(cursorDate, "12:00", calendar.timezone);
    const local = getLocalDateParts(cursor, calendar.timezone);
    const reason = tradingDayReason(symbol, exchange, cursor, calendar);
    if (!reason) {
      const closeTime = calendar.earlyCloses[local.isoDate] ?? calendar.closeTime;
      days.push({
        date: local.isoDate,
        period1: zonedTimeToUtc(local.isoDate, calendar.openTime, calendar.timezone),
        period2: zonedTimeToUtc(local.isoDate, closeTime, calendar.timezone),
        calendar
      });
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
  return days;
}

/**
 * Décide si une donnée de marché doit être rafraîchie selon la range demandée.
 *
 * @param symbol Symbole Yahoo Finance.
 * @param exchange Place de cotation optionnelle.
 * @param cacheUpdatedAt Date du cache en millisecondes.
 * @param range Range historique demandée.
 * @returns true si le cache ne couvre pas la dernière clôture ou si le marché est ouvert.
 */
export function shouldRefreshMarketData(symbol: string, exchange: string | undefined, cacheUpdatedAt: number | undefined, range: RangeKey) {
  if (!cacheUpdatedAt) return true;
  if (range === "1d" || range === "1w") {
    if (isMarketOpen(symbol, exchange)) return true;
    return cacheUpdatedAt < getLastTradingDay(symbol, exchange).period2.getTime();
  }
  if (!isMarketOpen(symbol, exchange)) return false;
  return Date.now() - cacheUpdatedAt > 60 * 60 * 1000;
}
