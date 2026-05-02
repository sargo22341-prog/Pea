/**
 * Role du fichier : recuperer les dividendes Yahoo via chart events et les
 * convertir dans le DTO DividendEvent.
 */

import type { DividendEvent, Quote } from "@pea/shared";
import { buildHistoricalOptions } from "../../../utils/range.js";
import type { MarketDataResult } from "../../market/market-data-provider.js";
import { dedupeInFlight } from "../../shared/inFlightDeduper.js";
import { readCache, writeCache } from "../cache/yahoo.cache.js";
import { safeYahooCall, yahooClient } from "../yahoo.client.js";
import { markStaleList } from "../utils/stale.js";

export type QuoteReader = (symbol: string) => Promise<MarketDataResult<Quote>>;

/** Recupere les dividendes des cinq dernieres annees et reutilise la devise de la quote. */
export async function fetchDividends(symbol: string, quoteReader: QuoteReader): Promise<MarketDataResult<DividendEvent[]>> {
  const key = symbol.toUpperCase();

  const result = await safeYahooCall<DividendEvent[]>(
    `dividends:${key}`,
    async () => {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 5);
      const { tradingDay: _tradingDay, marketHours: _marketHours, displayInterval: _displayInterval, ...yahooOptions } = buildHistoricalOptions("all", { period1 });
      const chart = (await dedupeInFlight(`chart:${key}:dividends:${yahooOptions.interval}`, () =>
        yahooClient.chart(key, { ...yahooOptions, events: "div", return: "array" } as any)
      )) as any;
      const rows = chart.events?.dividends ?? [];

      const quote = await quoteReader(key);
      const dividends: DividendEvent[] = rows
        .filter((row: any) => row.date && row.amount)
        .map((row: any) => ({
          symbol: key,
          date: new Date(row.date).toISOString(),
          amount: Number(row.amount),
          currency: quote.data.currency,
          status: "real" as const
        }));
      return dividends;
    },
    () => readCache<DividendEvent[]>("cached_dividends", key, 60 * 60 * 12),
    (data) => writeCache("cached_dividends", key, data)
  );

  return { data: markStaleList(result.data, result.stale), stale: result.stale };
}
