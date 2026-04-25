import holidays from "../data/market-holidays.json" with { type: "json" };
import type { RangeKey } from "@pea/shared";

export interface MarketCalendar {
  market: "euronext" | "italy" | "xetra" | "madrid" | "london" | "us" | "toronto" | "fallback";
  timezone: string;
  openTime: string;
  closeTime: string;
  holidays: string[];
  earlyCloses: Record<string, string>;
}

const defaultHours = {
  timezone: "Europe/Paris",
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
    return {
      market: "euronext",
      timezone,
      openTime: timezone === "Europe/Lisbon" ? "08:00" : "09:00",
      closeTime: timezone === "Europe/Lisbon" ? "16:30" : "17:30",
      holidays: holidayList("euronext"),
      earlyCloses: {}
    };
  }
  if (input.includes(".MI") || input.includes("MILAN") || input.includes("ITALIANA")) return { market: "italy", timezone: "Europe/Rome", openTime: "09:00", closeTime: "17:30", holidays: [], earlyCloses: {} };
  if (input.includes(".DE") || input.includes("XETRA") || input.includes("FRANKFURT")) return { market: "xetra", timezone: "Europe/Berlin", openTime: "09:00", closeTime: "17:30", holidays: [], earlyCloses: {} };
  if (input.includes(".MC") || input.includes("MADRID")) return { market: "madrid", timezone: "Europe/Madrid", openTime: "09:00", closeTime: "17:30", holidays: [], earlyCloses: {} };
  if (input.includes(".L") || input.includes("LONDON")) return { market: "london", timezone: "Europe/London", openTime: "08:00", closeTime: "16:30", holidays: [], earlyCloses: {} };
  if (input.includes(".TO") || input.includes("TORONTO")) return { market: "toronto", timezone: "America/Toronto", openTime: "09:30", closeTime: "16:00", holidays: [], earlyCloses: {} };
  if (!String(symbol ?? "").includes(".") || input.includes("NASDAQ") || input.includes("NYSE") || input.includes("AMEX") || input.includes("NEW YORK")) {
    return { market: "us", timezone: "America/New_York", openTime: "09:30", closeTime: "16:00", holidays: holidayList("us"), earlyCloses: holidays.us.earlyCloses };
  }
  return { market: "fallback", holidays: [], earlyCloses: {}, ...defaultHours };
}

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    isoDate: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute"))
  };
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function zonedTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const observedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(utc.getTime() - (observedAsUtc - utc.getTime()));
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
  const cursor = new Date(date);
  for (let index = 0; index < 10; index += 1) {
    const local = getLocalDateParts(cursor, calendar.timezone);
    const closeTime = calendar.earlyCloses[local.isoDate] ?? calendar.closeTime;
    if (isTradingDay(symbol, exchange, cursor)) {
      if (local.minutes >= timeToMinutes(calendar.openTime) || index > 0) {
        return {
          date: local.isoDate,
          period1: zonedTimeToUtc(local.isoDate, calendar.openTime, calendar.timezone),
          period2: zonedTimeToUtc(local.isoDate, closeTime, calendar.timezone),
          calendar
        };
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    cursor.setUTCHours(23, 59, 0, 0);
  }
  const local = getLocalDateParts(date, calendar.timezone);
  return {
    date: local.isoDate,
    period1: zonedTimeToUtc(local.isoDate, calendar.openTime, calendar.timezone),
    period2: zonedTimeToUtc(local.isoDate, calendar.closeTime, calendar.timezone),
    calendar
  };
}

export function shouldRefreshMarketData(symbol: string, exchange: string | undefined, cacheUpdatedAt: number | undefined, range: RangeKey) {
  if (range !== "1d") return !cacheUpdatedAt || Date.now() - cacheUpdatedAt > 60 * 60 * 1000;
  if (!isMarketOpen(symbol, exchange)) return false;
  return !cacheUpdatedAt || Date.now() - cacheUpdatedAt > 90 * 1000;
}
