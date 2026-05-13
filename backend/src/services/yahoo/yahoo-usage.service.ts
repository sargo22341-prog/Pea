import { yahooUsageRepository, type YahooUsageLogInput, type YahooUsageStatsQuery } from "./yahoo-usage.repository.js";
import { currentYahooUsageSource } from "./yahoo-usage-context.js";

const quoteSummaryModules = ["summaryProfile", "assetProfile", "price", "summaryDetail"];
const fundamentalsModules = [
  "assetProfile",
  "calendarEvents",
  "financialData",
  "fundProfile",
  "fundPerformance",
  "topHoldings",
  "summaryDetail",
  "price",
  "quoteType"
];

export interface YahooUsageMetadata {
  method?: string;
  modules?: string[];
  ticker?: string;
  tickers?: string[];
  tickerCount?: number;
  internalSource?: string;
  range?: string;
  interval?: string;
}

function uniqueTickers(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function sourceFor(method: string, key: string) {
  const contextSource = currentYahooUsageSource();
  if (contextSource) return contextSource;
  if (key.startsWith("news:")) return "news";
  if (key.startsWith("search:")) return "search";
  if (key.startsWith("screener:")) return "top-and-losers";
  if (key.startsWith("trendingSymbols:") || key.startsWith("quote:trendingSymbols:")) return "top-movers";
  if (key.startsWith("icon:")) return "asset-icons";
  if (key.startsWith("history:") || key.startsWith("chart:")) return "asset-refresh";
  if (key.startsWith("dividends:")) return "dividends";
  if (key.startsWith("fundamentals")) return "asset-refresh";
  if (key.startsWith("market-") || key.startsWith("quote-summary:")) return "market-data";
  if (method === "quote" || method === "quoteBatch") return "portfolio-or-watchlist";
  return "backend";
}

export function inferYahooUsageMetadata(key: string): YahooUsageMetadata {
  const parts = key.split(":");
  const prefix = parts[0] ?? key;

  if (prefix === "market-quote-batch" || prefix === "market-quote-batch-raw" || prefix === "quoteBatch") {
    const tickers = uniqueTickers(parts[1] ?? "");
    return { method: "quote", tickers, ticker: tickers[0], tickerCount: tickers.length, internalSource: sourceFor("quoteBatch", key) };
  }
  if (prefix === "quoteCombine") {
    const tickers = uniqueTickers(parts[1] ?? "");
    return { method: "quoteCombine", tickers, ticker: tickers[0], tickerCount: tickers.length, internalSource: sourceFor("quoteCombine", key) };
  }
  if (prefix === "quote" && parts[1] === "trendingSymbols") {
    const tickers = uniqueTickers(parts.slice(3).join(":"));
    return { method: "quote", tickers, ticker: tickers[0], tickerCount: tickers.length, internalSource: sourceFor("quote", key) };
  }
  if (prefix === "market-quote" || prefix === "quote") {
    return { method: "quote", ticker: parts[1], internalSource: sourceFor("quote", key) };
  }
  if (prefix === "quote-summary") {
    return { method: "quoteSummary", ticker: parts[1], modules: quoteSummaryModules, internalSource: sourceFor("quoteSummary", key) };
  }
  if (prefix === "fundamentals") {
    return { method: "quoteSummary", ticker: parts[1], modules: fundamentalsModules, internalSource: sourceFor("quoteSummary", key) };
  }
  if (prefix === "fundamentals-timeseries") {
    return { method: "fundamentalsTimeSeries", ticker: parts[1], modules: [parts[2] ?? "financials"], internalSource: sourceFor("fundamentalsTimeSeries", key) };
  }
  if (prefix === "history") {
    return { method: "chart", ticker: parts[1], range: parts[2], internalSource: sourceFor("chart", key) };
  }
  if (prefix === "chart") {
    return { method: "chart", ticker: parts[1], range: parts[2], interval: parts.at(-1), internalSource: sourceFor("chart", key) };
  }
  if (prefix === "dividends") {
    return { method: "chart", ticker: parts[1], modules: ["events:div"], range: "all", internalSource: sourceFor("chart", key) };
  }
  if (prefix === "search") {
    return { method: "search", internalSource: sourceFor("search", key) };
  }
  if (prefix === "news") {
    return { method: "search", ticker: /^[A-Z0-9._-]+$/.test(parts[1] ?? "") ? parts[1] : undefined, modules: ["news"], internalSource: sourceFor("search", key) };
  }
  if (prefix === "screener") {
    return { method: "screener", modules: [parts[1]].filter(Boolean), internalSource: sourceFor("screener", key) };
  }
  if (prefix === "trendingSymbols") {
    return { method: "trendingSymbols", modules: [parts[1]].filter(Boolean), internalSource: sourceFor("trendingSymbols", key) };
  }
  if (prefix === "icon") {
    return { method: "quoteSummary", ticker: parts[1], modules: ["assetProfile"], internalSource: sourceFor("quoteSummary", key) };
  }

  return { method: prefix || "unknown", internalSource: sourceFor(prefix, key) };
}

export function recordYahooUsage(key: string, input: Omit<YahooUsageLogInput, "method" | "durationMs" | "success"> & { durationMs: number; success: boolean; metadata?: YahooUsageMetadata }) {
  const inferred = inferYahooUsageMetadata(key);
  const metadata = { ...inferred, ...input.metadata };
  try {
    yahooUsageRepository.record({
      method: metadata.method ?? "unknown",
      modules: metadata.modules,
      ticker: metadata.ticker,
      tickers: metadata.tickers,
      tickerCount: metadata.tickerCount,
      durationMs: input.durationMs,
      success: input.success,
      errorMessage: input.errorMessage,
      internalSource: metadata.internalSource,
      range: metadata.range,
      interval: metadata.interval,
      cacheHit: input.cacheHit,
      requestKey: key
    });
  } catch {
    // Le tracking ne doit jamais modifier le resultat de l'appel Yahoo metier.
  }
}

export const yahooUsageService = {
  stats: (query: YahooUsageStatsQuery) => yahooUsageRepository.stats(query),
  list: (query: YahooUsageStatsQuery) => yahooUsageRepository.list(query)
};
