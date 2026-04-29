/**
 * Rôle du fichier : transformer les réponses Yahoo Finance en DTO légers,
 * appliquer les caches par type de donnée et éviter toute fuite de payload brut.
 */

import type {
  AssetArticlesDto,
  AssetChartDto,
  AssetDividendsDto,
  AssetMarketDto,
  AssetStaticDto,
  HistoryPoint,
  MarketState,
  NewsLanguage,
  RangeKey,
  UserAssetPositionDto
} from "@pea/shared";
import { buildHistoricalOptions } from "../utils/range.js";
import { getLastTradingDay, isMarketOpen } from "./marketCalendar.service.js";
import {
  assetChartCacheKey,
  chartTtlMs,
  expiresIn,
  normalizeMarketState,
  nowMs,
  readJsonCache,
  readStaticJsonCache,
  shortChartRanges,
  toDisplayRange,
  writeAssetChartCache,
  writeJsonCache,
  writeStaticJsonCache
} from "./cache.service.js";
import { yahooService } from "./yahoo.service.js";
import { portfolioService } from "./portfolio.service.js";
import { db } from "../db.js";

const staticTtlMs = 7 * 24 * 60 * 60 * 1000;
const marketTtlMs = 3 * 60 * 60 * 1000;
const dividendsTtlMs = 24 * 60 * 60 * 1000;
const articlesTtlMs = 6 * 60 * 60 * 1000;

/**
 * Extrait un nombre fini depuis une structure Yahoo ou DTO.
 *
 * @param value Valeur inconnue issue d'un service externe.
 * @returns Nombre utilisable ou undefined.
 */
function numberOrUndefined(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

/**
 * Extrait une chaîne non vide depuis une structure Yahoo ou DTO.
 *
 * @param value Valeur inconnue issue d'un service externe.
 * @returns Chaîne utilisable ou undefined.
 */
function stringOrUndefined(value: unknown) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  return stringValue || undefined;
}

/**
 * Convertit des points historiques objet en tableaux timestamp/prix.
 *
 * @param points Points historiques normalisés.
 * @returns Deux tableaux compacts pour les charts frontend.
 */
function compactHistory(points: HistoryPoint[]) {
  const timestamps: number[] = [];
  const prices: number[] = [];
  for (const point of points) {
    const timestamp = new Date(point.date).getTime();
    const price = Number(point.close);
    if (!Number.isFinite(timestamp) || !Number.isFinite(price)) continue;
    timestamps.push(timestamp);
    prices.push(price);
  }
  return { timestamps, prices };
}

/**
 * Calcule la performance entre le premier et le dernier prix d'un tableau.
 *
 * @param prices Prix triés chronologiquement.
 * @returns Performance absolue et relative.
 */
function rangePerformance(prices: number[]) {
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return {};
  const performanceEuro = last - first;
  return {
    performanceEuro,
    performancePercent: first ? (performanceEuro / first) * 100 : 0
  };
}

/**
 * Déduit le type d'actif static depuis Yahoo.
 *
 * @param quoteType Type Yahoo Finance.
 * @returns Type limité aux deux familles affichées par l'application.
 */
function staticAssetType(quoteType?: string): "stock" | "etf" {
  return String(quoteType ?? "").toUpperCase().includes("ETF") ? "etf" : "stock";
}

/**
 * Agrège les métriques de revenus disponibles dans quoteSummary.
 *
 * @param summary Réponse quoteSummary déjà mise en cache par le service Yahoo.
 * @returns Revenus, résultat net et marge lorsque Yahoo les expose.
 */
function financialMetrics(summary: any) {
  const statement = summary?.incomeStatementHistory?.incomeStatementHistory?.[0] ?? summary?.incomeStatementHistory?.incomeStatementHistoryQuarterly?.[0];
  const revenue = numberOrUndefined(statement?.totalRevenue);
  const netIncome = numberOrUndefined(statement?.netIncome);
  return {
    revenue,
    netIncome,
    netMargin: revenue && netIncome != null ? (netIncome / revenue) * 100 : undefined
  };
}

interface ChartFreshness {
  marketState?: MarketState;
  forceRefresh: boolean;
  minimumCachedAt?: number;
  minimumPayloadTimestamp?: number;
  ignoreTtl: boolean;
}

/**
 * Construit la règle de fraîcheur des charts intraday et 1W.
 *
 * @param symbol Symbole Yahoo Finance.
 * @param exchange Place de cotation issue de la quote.
 * @param marketState Etat Yahoo normalisé au moment de la demande.
 * @returns Décision de refresh et date minimale de cache acceptable.
 */
function shortRangeFreshness(symbol: string, exchange: string | undefined, marketState: MarketState): ChartFreshness {
  if (isMarketOpen(symbol, exchange)) {
    return { marketState, forceRefresh: true, ignoreTtl: true };
  }

  const lastCloseAt = getLastTradingDay(symbol, exchange).period2.getTime();
  return {
    marketState,
    forceRefresh: false,
    minimumCachedAt: lastCloseAt,
    minimumPayloadTimestamp: lastCloseAt - 15 * 60 * 1000,
    ignoreTtl: true
  };
}

/**
 * Service applicatif chargé des caches asset indépendants du portefeuille.
 */
export class AssetDataService {
  /**
   * Retourne les données static longue durée d'un actif.
   *
   * @param symbol Symbole Yahoo Finance.
   * @returns DTO static prêt à afficher.
   */
  async static(symbol: string): Promise<AssetStaticDto> {
    const key = symbol.toUpperCase();
    const cached = readStaticJsonCache<AssetStaticDto>("asset_static_cache", "symbol", key);
    if (cached) return cached.payload;

    const [quoteResult, fundamentalsResult] = await Promise.all([
      yahooService.quote(key),
      yahooService.fundamentals(key).catch(() => ({ data: undefined }))
    ]);
    const quote = quoteResult.data;
    const summary = fundamentalsResult.data as any;
    const payload: AssetStaticDto = {
      symbol: key,
      name: quote.name,
      type: staticAssetType(quote.quoteType),
      currency: quote.currency,
      exchange: quote.exchange ?? "",
      country: stringOrUndefined(summary?.assetProfile?.country),
      sector: stringOrUndefined(summary?.assetProfile?.sector)
    };
    const cachedAt = nowMs();
    writeStaticJsonCache("asset_static_cache", "symbol", key, payload, cachedAt, expiresIn(staticTtlMs));
    db.prepare(
      `INSERT INTO assets (symbol, name, type, currency, exchange, country, sector, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, type = excluded.type, currency = excluded.currency, exchange = excluded.exchange, country = excluded.country, sector = excluded.sector, updated_at = excluded.updated_at`
    ).run(payload.symbol, payload.name, payload.type, payload.currency, payload.exchange, payload.country ?? null, payload.sector ?? null, cachedAt);
    return payload;
  }

  /**
   * Retourne un chart d'actif compact avec TTL et contrôle d'état de marché pour le court terme.
   *
   * @param symbol Symbole Yahoo Finance.
   * @param range Range demandée par l'API historique.
   * @returns DTO chart compact.
   */
  async chart(symbol: string, range: RangeKey): Promise<AssetChartDto> {
    const key = symbol.toUpperCase();
    const interval = String(buildHistoricalOptions(range, { symbol: key }).displayInterval);
    const cacheKey = assetChartCacheKey(key, range, interval);
    const freshness = shortChartRanges.has(range) ? await this.chartFreshness(key) : undefined;
    const cached = readJsonCache<AssetChartDto>({
      table: "asset_chart_cache",
      keyColumn: "cache_key",
      key: cacheKey,
      currentMarketState: freshness?.marketState,
      checkMarketState: false,
      forceRefresh: freshness?.forceRefresh,
      minimumCachedAt: freshness?.minimumCachedAt,
      minimumPayloadTimestamp: freshness?.minimumPayloadTimestamp,
      ignoreTtl: freshness?.ignoreTtl
    });
    if (cached) return cached.payload;

    const history = (await yahooService.history(key, range)).data;
    const compact = compactHistory(history);
    const cachedAt = nowMs();
    const payload: AssetChartDto = {
      symbol: key,
      range: toDisplayRange(range),
      interval,
      timestamps: compact.timestamps,
      prices: compact.prices,
      ...rangePerformance(compact.prices),
      marketState: freshness?.marketState,
      cachedAt,
      expiresAt: expiresIn(chartTtlMs(range))
    };
    writeAssetChartCache(cacheKey, key, payload.range, interval, payload, payload.cachedAt, payload.expiresAt, freshness?.marketState);
    return payload;
  }

  /**
   * Retourne les métriques de marché dynamiques avec refresh sur changement d'état de marché.
   *
   * @param symbol Symbole Yahoo Finance.
   * @returns DTO marché léger.
   */
  async market(symbol: string): Promise<AssetMarketDto> {
    const key = symbol.toUpperCase();
    const currentMarketState = await this.currentMarketState(key);
    const cached = readJsonCache<AssetMarketDto>({
      table: "asset_market_cache",
      keyColumn: "symbol",
      key,
      currentMarketState,
      checkMarketState: true
    });
    if (cached) return cached.payload;

    const [quoteResult, marketInfoResult, fundamentalsResult] = await Promise.all([
      yahooService.quote(key),
      yahooService.marketInfo(key),
      yahooService.fundamentals(key).catch(() => ({ data: undefined }))
    ]);
    const quote = quoteResult.data;
    const marketInfo = marketInfoResult.data;
    const financials = financialMetrics(fundamentalsResult.data);
    const cachedAt = nowMs();
    const payload: AssetMarketDto = {
      symbol: key,
      marketState: currentMarketState,
      dayChange: quote.change ?? marketInfo.regularMarketChange ?? 0,
      dayChangePercent: quote.changePercent ?? marketInfo.regularMarketChangePercent ?? 0,
      volume: marketInfo.regularMarketVolume ?? 0,
      avgVolume3M: marketInfo.averageDailyVolume3Month,
      week52Low: marketInfo.fiftyTwoWeekLow,
      week52High: marketInfo.fiftyTwoWeekHigh,
      dividendYield: marketInfo.dividendYield ?? quote.dividendYield,
      annualDividend: marketInfo.dividendRate ?? quote.dividendRate,
      exDividendDate: marketInfo.exDividendDate,
      ...financials,
      cachedAt,
      expiresAt: expiresIn(marketTtlMs)
    };
    writeJsonCache("asset_market_cache", "symbol", key, payload, cachedAt, payload.expiresAt, currentMarketState);
    return payload;
  }

  /**
   * Retourne les dividendes normalisés d'un actif.
   *
   * @param symbol Symbole Yahoo Finance.
   * @returns DTO dividendes avec historique compact.
   */
  async dividends(symbol: string): Promise<AssetDividendsDto> {
    const key = symbol.toUpperCase();
    const cached = readStaticJsonCache<AssetDividendsDto>("asset_dividend_cache", "symbol", key);
    if (cached) return cached.payload;

    const [dividendsResult, marketResult] = await Promise.all([
      yahooService.dividends(key),
      this.market(key).catch(() => undefined)
    ]);
    const history = dividendsResult.data.map((event) => ({ date: event.date, amount: event.amount }));
    const cachedAt = nowMs();
    const payload: AssetDividendsDto = {
      symbol: key,
      totalDividends: history.reduce((sum, event) => sum + event.amount, 0),
      annualDividend: marketResult?.annualDividend,
      dividendYield: marketResult?.dividendYield,
      exDate: marketResult?.exDividendDate,
      history,
      cachedAt,
      expiresAt: expiresIn(dividendsTtlMs)
    };
    writeStaticJsonCache("asset_dividend_cache", "symbol", key, payload, cachedAt, payload.expiresAt);
    return payload;
  }

  /**
   * Retourne les articles normalisés d'un actif.
   *
   * @param symbol Symbole Yahoo Finance.
   * @param languages Langues autorisées par les préférences utilisateur.
   * @returns DTO articles léger.
   */
  async articles(symbol: string, languages?: NewsLanguage[]): Promise<AssetArticlesDto> {
    const key = symbol.toUpperCase();
    const cached = readStaticJsonCache<AssetArticlesDto>("asset_article_cache", "symbol", key);
    if (cached) return cached.payload;

    const articles = (await yahooService.news(key, languages)).data;
    const cachedAt = nowMs();
    const payload: AssetArticlesDto = {
      symbol: key,
      articles: articles.map((article) => ({
        title: article.title,
        url: article.url,
        source: article.publisher ?? "Yahoo Finance",
        publishedAt: article.publishedAt ?? new Date(cachedAt).toISOString(),
        imageUrl: article.imageUrl,
        summary: article.description
      })),
      cachedAt,
      expiresAt: expiresIn(articlesTtlMs)
    };
    writeStaticJsonCache("asset_article_cache", "symbol", key, payload, cachedAt, payload.expiresAt);
    return payload;
  }

  /**
   * Retourne la position utilisateur calculée et persistée.
   *
   * @param userId Identifiant utilisateur.
   * @param symbol Symbole Yahoo Finance.
   * @returns DTO position utilisateur ou undefined si l'actif n'est pas détenu.
   */
  userPosition(userId: string, symbol: string): UserAssetPositionDto | undefined {
    return portfolioService.userAssetPosition(userId, symbol);
  }

  /**
   * Lit l'état de marché courant depuis le quote DTO, sans exposer le payload Yahoo.
   *
   * @param symbol Symbole Yahoo Finance.
   * @returns Etat de marché normalisé.
   */
  private async currentMarketState(symbol: string): Promise<MarketState> {
    const quote = await yahooService.quote(symbol);
    return normalizeMarketState(quote.data.marketState);
  }

  /**
   * Lit la quote courante pour décider si le chart court terme doit être rafraîchi.
   *
   * @param symbol Symbole Yahoo Finance.
   * @returns Règle de fraîcheur basée sur ouverture de marché et dernière clôture.
   */
  private async chartFreshness(symbol: string): Promise<ChartFreshness> {
    const quote = await yahooService.quote(symbol);
    return shortRangeFreshness(symbol, quote.data.exchange, normalizeMarketState(quote.data.marketState));
  }
}

export const assetDataService = new AssetDataService();
