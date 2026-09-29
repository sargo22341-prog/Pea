import type { TopMover } from "@pea/shared";
import { normalizeDividendYield } from "../yahoo.mapper.js";

/** Nombre de titres conservés par liste. */
export const MARKET_LIST_COUNT = 10;

/** Transforme une valeur Yahoo optionnelle en nombre fini, sinon undefined. */
function finiteNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return value !== undefined && value !== null && Number.isFinite(numberValue) ? numberValue : undefined;
}

/** Transforme une valeur Yahoo optionnelle en chaine non vide, sinon undefined. */
function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Un PER négatif ou nul n'a pas de sens de valorisation : il n'est pas affiché. */
function positive(value: number | undefined) {
  return value !== undefined && value > 0 ? value : undefined;
}

/** Mappe les quotes brutes (screener ou lot de cotations) vers le DTO exposé au frontend. */
export function mapScreenerQuotes(rawQuotes: unknown): TopMover[] {
  if (!Array.isArray(rawQuotes)) return [];

  return rawQuotes
    .map((quote): TopMover | null => {
      const row = (quote ?? {}) as Record<string, unknown>;
      const symbol = optionalString(row["symbol"]);
      const price = finiteNumber(row["regularMarketPrice"]);
      const changePercent = finiteNumber(row["regularMarketChangePercent"]);
      const change = finiteNumber(row["regularMarketChange"]);

      if (!symbol || price === undefined || changePercent === undefined || change === undefined) return null;

      return {
        symbol,
        shortName: optionalString(row["shortName"]) ?? optionalString(row["displayName"]) ?? optionalString(row["longName"]) ?? symbol,
        price,
        changePercent,
        change,
        currency: optionalString(row["currency"]),
        exchange: optionalString(row["fullExchangeName"]) ?? optionalString(row["exchange"]),
        quoteType: optionalString(row["quoteType"]),
        trailingPE: positive(finiteNumber(row["trailingPE"])),
        dividendYield: normalizeDividendYield(row["trailingAnnualDividendYield"] ?? row["dividendYield"]) ?? undefined,
        marketCap: positive(finiteNumber(row["marketCap"]))
      };
    })
    .filter((item): item is TopMover => Boolean(item))
    .slice(0, MARKET_LIST_COUNT);
}
