import { parseIsoDateParts, type HistoryPoint, type RangeKey } from "@pea/shared";
import type { AssetRow } from "../../../repositories/market/asset.repository.js";
import { logger } from "../../shared/logger.service.js";
import { zonedTimeToUtc } from "../../timezone/date-time.service.js";
import { getLastTradingDay, getMarketDateKey, getOpenMarketDaysBetween, getPreviousOpenMarketDays, type OpenMarketDay } from "../calendars/marketCalendar.service.js";
import type { StoredChartRange } from "./chart-config.service.js";

type MarketRef = Pick<AssetRow, "symbol" | "exchange">;

export const openMarketDayCountByRange: Partial<Record<RangeKey | StoredChartRange, number>> = {
  "1d": 1
};

/** Journée civile de marché exprimée en instants UTC : [start, end[. */
interface MarketDayInterval {
  start: number;
  end: number;
}

function nextIsoDate(isoDate: string) {
  const [year, month, day] = parseIsoDateParts(isoDate);
  return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

function marketDayInterval(day: OpenMarketDay): MarketDayInterval {
  const timeZone = day.calendar.timezone;
  return {
    start: zonedTimeToUtc(day.date, "00:00", timeZone).getTime(),
    end: zonedTimeToUtc(nextIsoDate(day.date), "00:00", timeZone).getTime()
  };
}

export function openMarketWindow(asset: MarketRef, range: RangeKey | StoredChartRange, endDate = new Date()) {
  const count = openMarketDayCountByRange[range];
  const cutoffDate = calendarRangeStart(range, endDate);
  const days = cutoffDate
    ? getOpenMarketDaysBetween({ symbol: asset.symbol, exchange: asset.exchange }, cutoffDate, endDate)
    : count
      ? getPreviousOpenMarketDays({ symbol: asset.symbol, exchange: asset.exchange }, endDate, count)
      : undefined;
  const oldestDay = days?.at(-1);
  if (!days || !oldestDay) return undefined;
  const period1 = cutoffDate ?? oldestDay.period1;
  return {
    days,
    dateSet: new Set(days.map((day) => day.date)),
    dayIntervals: days.map(marketDayInterval).sort((a, b) => a.start - b.start),
    cutoffIso: period1.toISOString(),
    period1,
    period2: endDate
  };
}

export function shortRangeEndDate(asset: MarketRef, now = new Date()) {
  const session = getLastTradingDay(asset.symbol, asset.exchange, now);
  if (now.getTime() >= session.period1.getTime() && now.getTime() <= session.period2.getTime()) return now;
  return session.period2;
}

export function periodForRange(asset: MarketRef, range: StoredChartRange, now = new Date()) {
  if (range === "all") return { period1: new Date("2000-01-01"), period2: now };
  const endDate = openMarketDayCountByRange[range] || calendarRangeStart(range, now) ? shortRangeEndDate(asset, now) : now;
  const window = openMarketWindow(asset, range, endDate);
  if (window) return { period1: window.period1, period2: endDate };
  logger.warn("market-data", "open market window unavailable; using last trading session fallback", {
    symbol: asset.symbol,
    exchange: asset.exchange,
    range,
    endDate: endDate.toISOString()
  });
  return { period1: endDate, period2: endDate };
}

function calendarRangeStart(range: RangeKey | StoredChartRange, endDate: Date) {
  const start = new Date(endDate);
  if (range === "1w") {
    start.setDate(start.getDate() - 7);
    return start;
  }
  if (range === "1m") {
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  return undefined;
}

export function rangeCutoff(range: RangeKey) {
  const now = new Date();
  if (range === "1w") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return start.getTime();
  }
  if (range === "1m") {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 1);
    return start.getTime();
  }
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1).getTime();
  if (range === "1y") {
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 1);
    return start.getTime();
  }
  if (range === "5y") {
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 5);
    return start.getTime();
  }
  if (range === "10y") {
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 10);
    return start.getTime();
  }
  return undefined;
}

function insideDayIntervals(time: number, intervals: MarketDayInterval[]) {
  let low = 0;
  let high = intervals.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const interval = intervals[middle];
    if (!interval) return false;
    if (time < interval.start) high = middle - 1;
    else if (time >= interval.end) low = middle + 1;
    else return true;
  }
  return false;
}

/**
 * Garde les points appartenant aux journées de marché de la période. Les journées sont converties
 * une fois en bornes UTC : aucun calcul de fuseau horaire par point.
 */
export function filterRangePoints(points: HistoryPoint[], range: RangeKey, asset?: MarketRef, endDate = new Date()) {
  const window = asset ? openMarketWindow(asset, range, endDate) : undefined;
  if (asset && window) {
    return points.filter((point) => insideDayIntervals(Date.parse(point.date), window.dayIntervals));
  }
  const cutoff = rangeCutoff(range);
  if (!cutoff) return points;
  return points.filter((point) => Date.parse(point.date) >= cutoff);
}

/**
 * Plus petit instant qu'un point doit avoir pour survivre à `filterRangePoints` : permet de ne lire
 * en base que les candles utiles. `undefined` signifie « tout l'historique ».
 */
export function rangeLowerBoundIso(range: RangeKey, asset: MarketRef, endDate = new Date()) {
  const window = openMarketWindow(asset, range, endDate);
  const start = window ? window.dayIntervals[0]?.start : rangeCutoff(range);
  return start === undefined ? undefined : new Date(start).toISOString();
}

export function marketDateCount(points: HistoryPoint[], asset: MarketRef) {
  return new Set(points.map((point) => getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date)))).size;
}

export function latestStoredMarketDatePoints(points: HistoryPoint[], asset: MarketRef) {
  const byDate = new Map<string, HistoryPoint[]>();
  for (const point of points) {
    const date = getMarketDateKey(asset.symbol, asset.exchange, new Date(point.date));
    const group = byDate.get(date);
    if (group) group.push(point);
    else byDate.set(date, [point]);
  }
  const latestDate = [...byDate.keys()].sort().at(-1);
  return latestDate ? (byDate.get(latestDate) ?? []).sort((a, b) => a.date.localeCompare(b.date)) : [];
}
