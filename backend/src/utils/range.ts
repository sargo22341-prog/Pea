import type { RangeKey } from "@pea/shared";

type YahooInterval = "5m" | "1h" | "1d";
export type ChartDisplayInterval = "5m" | "2h" | "4h" | "1d";

export interface MarketHours {
  timezone: string;
  openTime: string;
  closeTime: string;
}

export function parseRange(value: unknown): RangeKey {
  const range = String(value ?? "1m").toLowerCase();
  if (range === "max") return "all";
  if (["1d", "1w", "1m", "1y", "ytd", "all"].includes(range)) {
    return range as RangeKey;
  }
  return "1m";
}

export function yahooRange(
  range: RangeKey,
  market: { symbol?: string; exchange?: string; fullExchangeName?: string } = {}
): { period1: Date; period2?: Date; interval: YahooInterval; displayInterval: ChartDisplayInterval; tradingDay?: string; marketHours?: MarketHours } {
  const now = new Date();
  const start = new Date(now);

  switch (range) {
    case "1d":
      return { ...getMarketSession(market.symbol, market.exchange, market.fullExchangeName, now), interval: "5m", displayInterval: "5m" };
    case "1w":
      start.setDate(now.getDate() - 7);
      return { period1: start, period2: now, interval: "1h", displayInterval: "2h" };
    case "1m":
      start.setMonth(now.getMonth() - 1);
      return { period1: start, interval: "1h", displayInterval: "4h" };
    case "1y":
      start.setFullYear(now.getFullYear() - 1);
      return { period1: start, interval: "1d", displayInterval: "1d" };
    case "ytd":
      return { period1: new Date(now.getFullYear(), 0, 1), interval: "1d", displayInterval: "1d" };
    case "all":
    case "max":
      return { period1: new Date("2000-01-01"), interval: "1d", displayInterval: "1d" };
    default:
      return { period1: start, interval: "1d", displayInterval: "1d" };
  }
}

export function isValidHistoricalDate(value: unknown): value is Date | string | number {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return Number.isFinite(new Date(value).getTime());
  return false;
}

export function buildHistoricalOptions(
  range: RangeKey,
  options: {
    period1?: Date | string | number | null;
    period2?: Date | string | number | null;
    events?: "history" | "dividends";
    symbol?: string;
    exchange?: string;
    fullExchangeName?: string;
  } = {}
) {
  const rangeOptions = yahooRange(range, options);
  const period1 = options.period1 ?? rangeOptions.period1;
  const period2 = options.period2 ?? rangeOptions.period2;
  const built: {
    period1: Date | string | number;
    period2?: Date | string | number;
    interval: YahooInterval;
    displayInterval: ChartDisplayInterval;
    events?: "history" | "dividends";
    tradingDay?: string;
    marketHours?: MarketHours;
  } = {
    period1: isValidHistoricalDate(period1) ? period1 : rangeOptions.period1,
    interval: rangeOptions.interval,
    displayInterval: rangeOptions.displayInterval,
    tradingDay: rangeOptions.tradingDay,
    marketHours: rangeOptions.marketHours
  };

  if (isValidHistoricalDate(period2)) {
    built.period2 = period2;
  }

  if (options.events === "dividends") {
    built.events = "dividends";
  }

  return built;
}

export function getMarketHours(symbol?: string, exchange?: string, fullExchangeName?: string): MarketHours {
  const normalizedSymbol = String(symbol ?? "").toUpperCase();
  const normalizedExchange = `${exchange ?? ""} ${fullExchangeName ?? ""}`.toUpperCase();

  if (normalizedSymbol.endsWith(".PA") || normalizedExchange.includes("PARIS")) return { timezone: "Europe/Paris", openTime: "09:00", closeTime: "17:30" };
  if (normalizedSymbol.endsWith(".AS") || normalizedExchange.includes("AMSTERDAM")) return { timezone: "Europe/Amsterdam", openTime: "09:00", closeTime: "17:30" };
  if (normalizedSymbol.endsWith(".BR") || normalizedExchange.includes("BRUSSELS")) return { timezone: "Europe/Brussels", openTime: "09:00", closeTime: "17:30" };
  if (normalizedSymbol.endsWith(".MI") || normalizedExchange.includes("MILAN") || normalizedExchange.includes("ITALIANA")) return { timezone: "Europe/Rome", openTime: "09:00", closeTime: "17:30" };
  if (normalizedSymbol.endsWith(".DE") || normalizedExchange.includes("XETRA") || normalizedExchange.includes("FRANKFURT")) return { timezone: "Europe/Berlin", openTime: "09:00", closeTime: "17:30" };
  if (normalizedSymbol.endsWith(".MC") || normalizedExchange.includes("MADRID")) return { timezone: "Europe/Madrid", openTime: "09:00", closeTime: "17:30" };
  if (normalizedSymbol.endsWith(".LS") || normalizedExchange.includes("LISBON")) return { timezone: "Europe/Lisbon", openTime: "08:00", closeTime: "16:30" };
  if (normalizedSymbol.endsWith(".L") || normalizedExchange.includes("LONDON")) return { timezone: "Europe/London", openTime: "08:00", closeTime: "16:30" };
  if (normalizedSymbol.endsWith(".TO") || normalizedExchange.includes("TORONTO")) return { timezone: "America/Toronto", openTime: "09:30", closeTime: "16:00" };
  if (
    !normalizedSymbol.includes(".") ||
    normalizedExchange.includes("NASDAQ") ||
    normalizedExchange.includes("NYSE") ||
    normalizedExchange.includes("AMEX") ||
    normalizedExchange.includes("NEW YORK")
  ) {
    return { timezone: "America/New_York", openTime: "09:30", closeTime: "16:00" };
  }

  return { timezone: "Europe/Paris", openTime: "09:00", closeTime: "17:30" };
}

export function getCurrentTradingDay(symbol?: string, exchange?: string, fullExchangeName?: string) {
  return getMarketSession(symbol, exchange, fullExchangeName).tradingDay;
}

function getMarketSession(symbol?: string, exchange?: string, fullExchangeName?: string, now = new Date()) {
  const marketHours = getMarketHours(symbol, exchange, fullExchangeName);
  const local = getLocalDateParts(now, marketHours.timezone);
  const [openHour, openMinute] = marketHours.openTime.split(":").map(Number);
  const [closeHour, closeMinute] = marketHours.closeTime.split(":").map(Number);

  const localToday = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const todayOpen = zonedTimeToUtc(local.year, local.month, local.day, openHour, openMinute, marketHours.timezone);
  const daysBack = local.weekday === "Sat" ? 1 : local.weekday === "Sun" ? 2 : now < todayOpen ? 1 : 0;
  const marketDay = new Date(localToday);
  marketDay.setUTCDate(localToday.getUTCDate() - daysBack);
  if (marketDay.getUTCDay() === 0) marketDay.setUTCDate(marketDay.getUTCDate() - 2);
  if (marketDay.getUTCDay() === 6) marketDay.setUTCDate(marketDay.getUTCDate() - 1);

  const period1 = zonedTimeToUtc(marketDay.getUTCFullYear(), marketDay.getUTCMonth() + 1, marketDay.getUTCDate(), openHour, openMinute, marketHours.timezone);
  const close = zonedTimeToUtc(marketDay.getUTCFullYear(), marketDay.getUTCMonth() + 1, marketDay.getUTCDate(), closeHour, closeMinute, marketHours.timezone);
  const period2 = now < period1 ? period1 : now > close ? close : now;
  const tradingDay = `${marketDay.getUTCFullYear()}-${String(marketDay.getUTCMonth() + 1).padStart(2, "0")}-${String(marketDay.getUTCDate()).padStart(2, "0")}`;

  return { period1, period2, tradingDay, marketHours };
}

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday")
  };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const observedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(utc.getTime() - (observedAsUtc - utc.getTime()));
}
