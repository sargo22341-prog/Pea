import type { RangeKey } from "@pea/shared";

export function parseRange(value: unknown): RangeKey {
  const range = String(value ?? "1m").toLowerCase();
  if (["1d", "1w", "1m", "1y", "ytd", "max"].includes(range)) {
    return range as RangeKey;
  }
  return "1m";
}

export function yahooRange(range: RangeKey): { period1: Date; period2?: Date; interval: "15m" | "1d" | "1wk" | "1mo" } {
  const now = new Date();
  const start = new Date(now);

  switch (range) {
    case "1d":
      return { ...getMarketHours(), interval: "15m" };
    case "1w":
      start.setDate(now.getDate() - 7);
      return { period1: start, interval: "1d" };
    case "1m":
      start.setMonth(now.getMonth() - 1);
      return { period1: start, interval: "1d" };
    case "1y":
      start.setFullYear(now.getFullYear() - 1);
      return { period1: start, interval: "1d" };
    case "ytd":
      return { period1: new Date(now.getFullYear(), 0, 1), interval: "1d" };
    case "max":
      return { period1: new Date("2000-01-01"), interval: "1mo" };
    default:
      return { period1: start, interval: "1d" };
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
  options: { period1?: Date | string | number | null; period2?: Date | string | number | null; events?: "history" | "dividends" } = {}
) {
  const rangeOptions = yahooRange(range);
  const period1 = options.period1 ?? rangeOptions.period1;
  const period2 = options.period2 ?? rangeOptions.period2;
  const built: { period1: Date | string | number; period2?: Date | string | number; interval: "15m" | "1d" | "1wk" | "1mo"; events?: "history" | "dividends" } = {
    period1: isValidHistoricalDate(period1) ? period1 : rangeOptions.period1,
    interval: rangeOptions.interval
  };

  if (isValidHistoricalDate(period2)) {
    built.period2 = period2;
  }

  if (options.events === "dividends") {
    built.events = "dividends";
  }

  return built;
}

export function getMarketHours(_symbol?: string, _exchange?: string) {
  const now = new Date();
  const paris = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(now);
  const value = (type: string) => paris.find((part) => part.type === type)?.value ?? "";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const weekday = value("weekday");

  const daysBack = weekday === "Sat" ? 1 : weekday === "Sun" ? 2 : 0;
  const marketDay = new Date(Date.UTC(year, month - 1, day - daysBack));
  const open = zonedTimeToUtc(marketDay.getUTCFullYear(), marketDay.getUTCMonth() + 1, marketDay.getUTCDate(), 9, 0, "Europe/Paris");
  const close = zonedTimeToUtc(marketDay.getUTCFullYear(), marketDay.getUTCMonth() + 1, marketDay.getUTCDate(), 17, 30, "Europe/Paris");
  const period2 = now < open ? open : now > close ? close : now;

  return { period1: open, period2 };
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
