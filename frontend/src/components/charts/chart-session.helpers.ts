import type { MarketSessionDto } from "@pea/shared";
import type { PriceHistoryChartPoint, PriceHistoryInputPoint } from "../../hooks/usePriceHistoryChart";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../lib/timezone";

export function withIntradaySessionPlaceholders(points: PriceHistoryChartPoint[], marketSession?: MarketSessionDto) {
  if (!marketSession || points.length === 0) return points;
  const firstTimestamp = points.map((point) => Number(point.date)).find(Number.isFinite);
  if (!firstTimestamp) return points;
  const session = marketSessionDomain(new Date(firstTimestamp), marketSession);
  const byDate = new Map(points.map((point) => [point.date, point]));
  if (!byDate.has(session.open)) byDate.set(session.open, { date: session.open, value: null });
  if (!byDate.has(session.close)) byDate.set(session.close, { date: session.close, value: null });
  return [...byDate.values()].sort((a, b) => a.date - b.date);
}

export function getIntradayDomain(points: PriceHistoryInputPoint[] | Array<{ date: number; value: number | null }>, marketSession?: MarketSessionDto) {
  if (!marketSession) return undefined;
  const firstTimestamp = points.map((point) => Number(point.date)).find(Number.isFinite);
  if (!firstTimestamp) return undefined;
  const session = marketSessionDomain(new Date(firstTimestamp), marketSession);
  return [session.open, session.close] as [number, number];
}

function marketSessionDomain(date: Date, marketSession: MarketSessionDto) {
  const timeZone = normalizeTimeZone(marketSession.timezone);
  const day = localIsoDate(date, timeZone);
  return {
    open: zonedTimeToUtc(day, marketSession.open, timeZone).getTime(),
    close: zonedTimeToUtc(day, marketSession.close, timeZone).getTime()
  };
}
