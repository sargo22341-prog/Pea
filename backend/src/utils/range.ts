import type { RangeKey } from "@pea/shared";
import { getLastTradingDay } from "../services/market/marketCalendar.service.js";

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
  if (range === "1a") return "1y";
  if (range === "5a") return "5y";
  if (range === "10a") return "10y";
  if (["1d", "1w", "1m", "1y", "5y", "10y", "ytd", "all"].includes(range)) {
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
    case "5y":
      start.setFullYear(now.getFullYear() - 5);
      return { period1: start, interval: "1d", displayInterval: "1d" };
    case "10y":
      start.setFullYear(now.getFullYear() - 10);
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

export function getCurrentTradingDay(symbol?: string, exchange?: string, fullExchangeName?: string) {
  return getMarketSession(symbol, exchange, fullExchangeName).tradingDay;
}

/** Construit une fenetre Yahoo intraday en UTC a partir du calendrier marche. */
function getMarketSession(symbol?: string, exchange?: string, fullExchangeName?: string, now = new Date()) {
  const session = getLastTradingDay(symbol, `${exchange ?? ""} ${fullExchangeName ?? ""}`, now);
  const period2 = now < session.period1 ? session.period1 : now > session.period2 ? session.period2 : now;
  return {
    period1: session.period1,
    period2,
    tradingDay: session.date,
    marketHours: { timezone: session.calendar.timezone, openTime: session.calendar.openTime, closeTime: session.calendar.closeTime }
  };
}
