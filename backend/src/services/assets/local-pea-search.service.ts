import type { EnrichedSearchResult } from "@pea/shared";
import peaAssets from "../../data/pea-actio-etf.json" with { type: "json" };
import { db } from "../../db.js";
import { currentUserId } from "../auth/user-context.js";

interface RawPeaAsset {
  code?: string | null;
  name?: string | null;
  etf?: boolean;
  yahoo?: boolean;
  currency?: string | null;
  symbol?: string | null;
  exchangeName?: string | null;
  fullExchangeName?: string | null;
  instrumentType?: string | null;
  longName?: string | null;
  shortName?: string | null;
}

interface LocalPeaAsset {
  symbol: string;
  name: string;
  currency?: string;
  exchange?: string;
  quoteType?: string;
  searchText: string;
}

const maxResults = 20;

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizeInstrumentType(item: RawPeaAsset) {
  if (item.instrumentType) return String(item.instrumentType).toUpperCase();
  if (item.etf === true) return "ETF";
  if (item.etf === false) return "EQUITY";
  return undefined;
}

function mapAsset(code: string, item: RawPeaAsset): LocalPeaAsset | undefined {
  if (item.yahoo === false) return undefined;

  const symbol = cleanString(item.symbol) ?? cleanString(item.code) ?? cleanString(code);
  if (!symbol) return undefined;

  const name = cleanString(item.longName) ?? cleanString(item.shortName) ?? cleanString(item.name) ?? symbol;
  const searchText = normalize([code, item.code, item.symbol, item.longName, item.shortName, item.name].filter(Boolean).join(" "));

  return {
    symbol: symbol.toUpperCase(),
    name,
    currency: cleanString(item.currency),
    exchange: cleanString(item.fullExchangeName) ?? cleanString(item.exchangeName),
    quoteType: normalizeInstrumentType(item),
    searchText
  };
}

const assets: LocalPeaAsset[] = Object.entries(peaAssets as unknown as Record<string, RawPeaAsset>)
  .map(([code, item]) => mapAsset(code, item))
  .filter((item): item is LocalPeaAsset => Boolean(item));

export class LocalPeaSearchService {
  search(query: string): EnrichedSearchResult[] {
    const normalizedQuery = normalize(query);
    if (normalizedQuery.length < 2) return [];

    const watchlistSymbols = new Set(db.prepare("SELECT symbol FROM watchlist WHERE user_id = ?").all(currentUserId()).map((row: any) => String(row.symbol).toUpperCase()));
    const portfolioSymbols = new Set(db.prepare("SELECT symbol FROM positions WHERE user_id = ?").all(currentUserId()).map((row: any) => String(row.symbol).toUpperCase()));

    return assets
      .filter((item) => item.searchText.includes(normalizedQuery))
      .slice(0, maxResults)
      .map((item) => ({
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
        quoteType: item.quoteType,
        currency: item.currency,
        isInWatchlist: watchlistSymbols.has(item.symbol),
        isInPortfolio: portfolioSymbols.has(item.symbol)
      }));
  }
}

export const localPeaSearchService = new LocalPeaSearchService();
