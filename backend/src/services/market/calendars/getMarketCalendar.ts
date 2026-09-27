import { parseIsoDateParts } from "@pea/shared";
import { timeToMinutes } from "../../timezone/date-time.service.js";
import { marketCalendarRules, marketCalendars, usExchangeKeywords, type MarketCalendar, type MarketCalendarRule, type MarketName, type MarketSession } from "./market-calendar.data.js";

export type { MarketCalendar, MarketDayOverride, MarketName, MarketSession } from "./market-calendar.data.js";

export function getSessionsForDate(calendar: Pick<MarketCalendar, "sessions" | "dayOverrides">, isoDate: string): MarketSession[] {
  if (!calendar.dayOverrides?.length) return calendar.sessions;
  const [y, m, d] = parseIsoDateParts(isoDate);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const override = calendar.dayOverrides.find((o) => o.days.includes(weekday));
  return override ? override.sessions : calendar.sessions;
}

function requireSession(session: MarketSession | undefined): MarketSession {
  if (!session) throw new Error("Market calendar has no trading session");
  return session;
}

export function getFirstSession(sessions: MarketSession[]) {
  return requireSession(sessions[0]);
}

export function getLastSession(sessions: MarketSession[]) {
  return requireSession(sessions.at(-1));
}

export function getFirstOpenTime(sessions: MarketSession[]) {
  return getFirstSession(sessions).openTime;
}

export function getFinalCloseTime(sessions: MarketSession[]) {
  return getLastSession(sessions).closeTime;
}

export function isInsideAnySession(localMinutes: number, sessions: MarketSession[]) {
  return sessions.some((session) => localMinutes >= timeToMinutes(session.openTime) && localMinutes <= timeToMinutes(session.closeTime));
}

function normalizeMarketInput(symbol?: string, exchange?: string) {
  return `${symbol ?? ""} ${exchange ?? ""}`.trim().toUpperCase();
}

function getYahooSuffix(symbol?: string): string | undefined {
  const raw = (symbol ?? "").trim().toUpperCase();
  const match = /\.([A-Z0-9]+)$/.exec(raw);
  return match?.[1];
}

function hasExchange(input: string, ...keywords: string[]) {
  return keywords.some((keyword) => input.includes(keyword.toUpperCase()));
}

function hasExactExchangeWord(input: string, ...keywords: string[]) {
  return keywords.some((keyword) => {
    const escaped = keyword.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(input);
  });
}

function ruleMatches(rule: MarketCalendarRule, input: string, suffix?: string) {
  return Boolean(
    (suffix && rule.suffixes?.includes(suffix)) ||
    (rule.exchangeKeywords?.length && hasExchange(input, ...rule.exchangeKeywords)) ||
    (rule.exactExchangeWords?.length && hasExactExchangeWord(input, ...rule.exactExchangeWords))
  );
}

function calendar(market: MarketName): MarketCalendar {
  return marketCalendars[market];
}

export function getMarketCalendar(symbol?: string, exchange?: string): MarketCalendar {
  const input = normalizeMarketInput(symbol, exchange);
  const suffix = getYahooSuffix(symbol);
  const rawSymbol = (symbol ?? "").trim().toUpperCase();
  const matchedRule = marketCalendarRules.find((rule) => ruleMatches(rule, input, suffix));
  if (matchedRule) return calendar(matchedRule.market);
  if (!rawSymbol.includes(".") || hasExchange(input, ...usExchangeKeywords)) return calendar("us");
  return calendar("fallback");
}
