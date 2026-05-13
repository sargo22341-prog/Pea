import type { Quote } from "@pea/shared";
import { normalizeDividendYield } from "../yahoo.mapper.js";

/** Normalise une quote Yahoo brute et conserve les valeurs de fallback historiques. */
export function normalizeQuote(item: any, fallbackSymbol: string): Quote {
  const key = String(item?.symbol ?? fallbackSymbol).toUpperCase();
  const price = Number(item.regularMarketPrice ?? item.postMarketPrice ?? item.preMarketPrice ?? 0);
  const previousClose = item.regularMarketPreviousClose ? Number(item.regularMarketPreviousClose) : undefined;
  return {
    symbol: key,
    name: item.longName ?? item.shortName ?? key,
    price,
    previousClose,
    change: item.regularMarketChange ? Number(item.regularMarketChange) : price - (previousClose ?? price),
    changePercent: item.regularMarketChangePercent ? Number(item.regularMarketChangePercent) : undefined,
    currency: item.currency ?? "EUR",
    exchange: item.fullExchangeName ?? item.exchange,
    quoteType: item.quoteType,
    marketState: item.marketState,
    dividendRate: item.trailingAnnualDividendRate ? Number(item.trailingAnnualDividendRate) : undefined,
    dividendYield: normalizeDividendYield(item.trailingAnnualDividendYield) ?? undefined,
    logoUrl: item.logoUrl
  };
}
