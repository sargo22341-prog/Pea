import type { NewsArticle, NewsLanguage } from "@pea/shared";
import { db } from "../../db.js";
import { currentUserId } from "../../services/auth/user-context.js";

export interface AssetNewsPositionRow {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  average_buy_price: number;
  currency: string;
  updated_at: string;
}

export interface AssetNewsCandidate {
  position: AssetNewsPositionRow;
  query: string;
  positionValue: number;
}

export const assetNewsCacheTtlSeconds = 30 * 60;
export const defaultAssetNewsLimit = 8;
export const maxAssetNewsLimit = 8;

/**
 * Indique si un actif doit etre ignore pour les news specifiques.
 */
export function shouldSkipAssetSpecificNews(asset: { symbol: string; name?: string; quoteType?: string; assetType?: string }) {
  const symbol = asset.symbol.toUpperCase();
  const name = String(asset.name ?? "").toUpperCase();
  const quoteType = String(asset.quoteType ?? "").toUpperCase();
  const assetType = String(asset.assetType ?? "").toUpperCase();
  return (
    assetType === "ETF" ||
    assetType === "FUND" ||
    quoteType.includes("ETF") ||
    quoteType.includes("FUND") ||
    quoteType.includes("MUTUALFUND") ||
    /\b(ETF|UCITS|MSCI|S&P|STOXX|AMUNDI|LYXOR|ISHARES|VANGUARD|XTRACKERS)\b/i.test(name) ||
    ["CW8.PA", "PE500.PA", "WPEA.PA"].includes(symbol)
  );
}

/**
 * Nettoie un nom Yahoo pour en faire une requete news d'entreprise.
 */
export function companyNewsQuery(name: string | undefined, symbol: string) {
  return String(name || symbol)
    .replace(/^L['’]\s*/i, "")
    .replace(/^COMPAGNIE DE\s+/i, "")
    .replace(/\b(SA|SE|S\.A\.|N\.V\.|NV|PLC|ORDINARY SHARES?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, "")
    .replace(/[.,]+$/g, "")
    .trim();
}

/**
 * Lit les positions utiles aux news directement en base, sans enrichissement Yahoo.
 */
export function listAssetNewsPositionRows(): AssetNewsPositionRow[] {
  return db.prepare("SELECT id, symbol, name, quantity, average_buy_price, currency, updated_at FROM positions WHERE user_id = ? ORDER BY symbol ASC").all(currentUserId()).map((row: any) => ({
    id: Number(row.id),
    symbol: String(row.symbol),
    name: String(row.name),
    quantity: Number(row.quantity),
    average_buy_price: Number(row.average_buy_price),
    currency: String(row.currency),
    updated_at: String(row.updated_at)
  }));
}

/**
 * Lit des metadonnees persistees pour eviter quoteBatch dans /news-assets.
 */
export function readStoredAssetNewsMetadata(symbol: string) {
  const key = symbol.toUpperCase();
  const asset = db.prepare("SELECT name, quote_type, type_disp FROM assets WHERE symbol = ?").get(key) as { name?: string; quote_type?: string; type_disp?: string } | undefined;
  const cachedQuote = db.prepare("SELECT payload FROM cached_quotes WHERE symbol = ?").get(key) as { payload?: string } | undefined;
  let quote: { name?: string; quoteType?: string } | undefined;
  if (cachedQuote?.payload) {
    try {
      quote = JSON.parse(String(cachedQuote.payload)) as { name?: string; quoteType?: string };
    } catch {
      quote = undefined;
    }
  }
  return {
    name: asset?.name ?? quote?.name,
    assetType: asset?.type_disp,
    quoteType: quote?.quoteType
  };
}

/**
 * Construit la signature de portefeuille utilisee par le cache agrege news-assets.
 */
export function assetNewsAggregateCacheKey(positions: AssetNewsPositionRow[], languages: NewsLanguage[], userId: number, limit: number, offset: number) {
  const signature = positions
    .map((position) => `${position.symbol}:${position.quantity}:${position.average_buy_price}:${position.updated_at}`)
    .join("|");
  return `news:assets:v5:${userId}:${languages.join(",")}:limit:${limit}:offset:${offset}:${signature}`;
}

/**
 * Lit le cache agrege de /news-assets avec un TTL long.
 */
export function readAssetNewsAggregateCache(cacheKey: string): NewsArticle[] | null {
  const row = db.prepare("SELECT payload, fetched_at FROM cached_news WHERE symbol = ?").get(cacheKey) as { payload: string; fetched_at: number } | undefined;
  if (!row) return null;
  if (Math.floor(Date.now() / 1000) - Number(row.fetched_at) > assetNewsCacheTtlSeconds) return null;
  return JSON.parse(String(row.payload)) as NewsArticle[];
}

/**
 * Ecrit le cache agrege de /news-assets.
 */
export function writeAssetNewsAggregateCache(cacheKey: string, articles: NewsArticle[]) {
  db.prepare(
    `INSERT INTO cached_news (symbol, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(cacheKey, JSON.stringify(articles), Math.floor(Date.now() / 1000));
}
