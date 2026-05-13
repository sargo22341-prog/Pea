import { marketCalendarRules, marketCalendars, usExchangeKeywords, type MarketCalendar, type MarketCalendarRule, type MarketName, type MarketSession } from "./market-calendar.data.js";

export type { MarketCalendar, MarketDayOverride, MarketName, MarketSession } from "./market-calendar.data.js";

export function getSessionsForDate(calendar: Pick<MarketCalendar, "sessions" | "dayOverrides">, isoDate: string): MarketSession[] {
  if (!calendar.dayOverrides?.length) return calendar.sessions;
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const override = calendar.dayOverrides.find((o) => o.days.includes(weekday));
  return override ? override.sessions : calendar.sessions;
}

export function getFirstOpenTime(sessions: MarketSession[]) {
  return sessions[0].openTime;
}

export function getFinalCloseTime(sessions: MarketSession[]) {
  return sessions[sessions.length - 1].closeTime;
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function isInsideAnySession(localMinutes: number, sessions: MarketSession[]) {
  return sessions.some((session) => localMinutes >= toMinutes(session.openTime) && localMinutes <= toMinutes(session.closeTime));
}

export function isAfterFinalClose(localMinutes: number, sessions: MarketSession[]) {
  return localMinutes > toMinutes(getFinalCloseTime(sessions));
}

function normalizeMarketInput(symbol?: string, exchange?: string) {
  return `${symbol ?? ""} ${exchange ?? ""}`.trim().toUpperCase();
}

function getYahooSuffix(symbol?: string): string | undefined {
  const raw = String(symbol ?? "").trim().toUpperCase();
  const match = raw.match(/\.([A-Z0-9]+)$/);
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
  const rawSymbol = String(symbol ?? "").trim().toUpperCase();
  const matchedRule = marketCalendarRules.find((rule) => ruleMatches(rule, input, suffix));
  if (matchedRule) return calendar(matchedRule.market);
  if (!rawSymbol.includes(".") || hasExchange(input, ...usExchangeKeywords)) return calendar("us");
  return calendar("fallback");
}
