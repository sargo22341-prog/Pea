/**
 * Role du fichier : exposer les DTO asset legers en s'appuyant sur les tables
 * marche persistantes. Les news gardent leur cache dedie; les donnees marche
 * passent par snapshots, candles, financials et dividendes stockes.
 */

import type {
  AssetArticlesDto,
  AssetChartDto,
  AssetDividendsDto,
  AssetMarketDto,
  AssetStaticDto,
  NewsLanguage,
  RangeKey,
  UserAssetPositionDto
} from "@pea/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { dataConstructionQueue } from "../market/construction/data-construction-queue.service.js";
import { dividendsService } from "../market/dividends/dividends.service.js";
import { marketDataService, type ChartDataOptions } from "../market/data/market-data.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { expiresIn, nowMs, readStaticJsonCache, writeStaticJsonCache } from "../shared/cache.service.js";
import { yahooService } from "../yahoo/index.js";

const articlesTtlMs = 6 * 60 * 60 * 1000;

function stringOrUndefined(value: unknown) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  return stringValue || undefined;
}

function staticAssetType(quoteType?: string): "stock" | "etf" {
  return String(quoteType ?? "").toUpperCase().includes("ETF") ? "etf" : "stock";
}

export class AssetDataService {
  async static(symbol: string): Promise<AssetStaticDto> {
    const key = symbol.toUpperCase();
    const existing = assetRepository.findBySymbol(key);
    const asset = existing ?? (config.enableMarketLiveRefresh ? undefined : await marketDataService.ensureAssetInitialized(key));
    if (!asset) {
      return { symbol: key, name: key, type: "stock", currency: "EUR", exchange: "" };
    }
    if (!existing) dataConstructionQueue.enqueueAssetConstruction(key);
    const profile = db.prepare("SELECT country, sector FROM asset_profiles WHERE asset_id = ?").get(asset.id) as any;
    return {
      symbol: key,
      name: asset.name,
      type: staticAssetType(asset.quote_type),
      currency: asset.currency ?? "EUR",
      exchange: asset.exchange ?? "",
      country: stringOrUndefined(profile?.country),
      sector: stringOrUndefined(profile?.sector)
    };
  }

  async chart(symbol: string, range: RangeKey, options: ChartDataOptions = {}): Promise<AssetChartDto> {
    return marketDataService.getChartData(symbol.toUpperCase(), range, options);
  }

  async market(symbol: string): Promise<AssetMarketDto> {
    const key = symbol.toUpperCase();
    if (!config.enableMarketLiveRefresh) await marketSnapshotService.getQuote(key);
    return marketSnapshotService.readMarketDto(key) ?? {
      symbol: key,
      marketState: "CLOSED",
      regularMarketPrice: undefined,
      cachedAt: nowMs(),
      expiresAt: nowMs()
    };
  }

  async dividends(symbol: string): Promise<AssetDividendsDto> {
    const key = symbol.toUpperCase();
    const marketResult = await this.market(key).catch(() => undefined);
    const history = dividendsService.readDividends(key).map((event) => ({ date: event.date, amount: event.amount }));
    const timestamp = nowMs();
    return {
      symbol: key,
      totalDividends: history.reduce((sum, event) => sum + event.amount, 0),
      annualDividend: marketResult?.annualDividend,
      dividendYield: marketResult?.dividendYield,
      exDate: marketResult?.exDividendDate,
      history,
      cachedAt: timestamp,
      expiresAt: timestamp
    };
  }

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

  userPosition(userId: string, symbol: string): UserAssetPositionDto | undefined {
    return portfolioService.userAssetPosition(userId, symbol);
  }
}

export const assetDataService = new AssetDataService();
