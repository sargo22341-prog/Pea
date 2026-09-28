import type { AssetMarketInfo } from "@pea/shared";
import { normalizeDividendYield } from "../../yahoo.mapper.js";
import { rawRecord, type YahooSummaryRaw } from "../../yahoo.raw.js";
import { rawDate, rawNumber, rawString } from "../../utils/raw-values.js";

/** Convertit quoteSummary en AssetMarketInfo consommé par l'API. */
export function marketInfoFromSummary(summary: YahooSummaryRaw): AssetMarketInfo {
  const price = summary.price ?? {};
  const detail = summary.summaryDetail ?? {};
  const range52 = rawRecord(detail["fiftyTwoWeekRange"]);
  return {
    marketState: rawString(price.marketState),
    regularMarketPrice: rawNumber(price.regularMarketPrice),
    regularMarketChange: rawNumber(price.regularMarketChange),
    regularMarketChangePercent: rawNumber(price.regularMarketChangePercent),
    regularMarketTime: rawDate(price.regularMarketTime),
    regularMarketPreviousClose: rawNumber(price.regularMarketPreviousClose) ?? rawNumber(detail.previousClose),
    regularMarketOpen: rawNumber(price.regularMarketOpen) ?? rawNumber(detail.open),
    regularMarketDayHigh: rawNumber(price.regularMarketDayHigh) ?? rawNumber(detail.dayHigh),
    regularMarketDayLow: rawNumber(price.regularMarketDayLow) ?? rawNumber(detail.dayLow),
    exchangeName: rawString(price.exchangeName) ?? rawString(price.exchange),
    currency: rawString(price.currency),
    regularMarketVolume: rawNumber(price.regularMarketVolume) ?? rawNumber(detail.volume),
    bid: rawNumber(price["bid"]),
    ask: rawNumber(price["ask"]),
    fiftyTwoWeekLow: rawNumber(detail.fiftyTwoWeekLow) ?? rawNumber(range52["low"]),
    fiftyTwoWeekHigh: rawNumber(detail.fiftyTwoWeekHigh) ?? rawNumber(range52["high"]),
    averageDailyVolume3Month: rawNumber(detail["averageDailyVolume3Month"]) ?? rawNumber(detail.averageVolume),
    totalAssets: rawNumber(detail.totalAssets) ?? rawNumber(summary.fundProfile?.["totalAssets"]) ?? rawNumber(summary.fundPerformance?.["totalAssets"]),
    dividendRate: rawNumber(detail.dividendRate) ?? rawNumber(price["trailingAnnualDividendRate"]),
    dividendYield: normalizeDividendYield(detail.dividendYield) ?? normalizeDividendYield(price["trailingAnnualDividendYield"]) ?? undefined,
    payoutRatio: rawNumber(detail.payoutRatio),
    exDividendDate: rawDate(detail.exDividendDate) ?? rawDate(summary.calendarEvents?.exDividendDate)
  };
}
