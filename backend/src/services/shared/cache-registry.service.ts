import { cacheRepository } from "../../repositories/cache/cache.repository.js";

export type CacheInvalidationEvent =
  | { type: "portfolio-user-changed"; userId: string; symbol?: string | undefined }
  | { type: "portfolio-all-users-changed"; symbol?: string | undefined }
  | { type: "frontend-block-changed"; userId?: string | number | undefined; block?: string | undefined }
  | { type: "PositionChanged"; userId: string | number; symbol?: string | undefined }
  | { type: "TransactionChanged"; userId: string | number; symbol?: string | undefined }
  | { type: "MarketSnapshotUpdated"; symbol: string }
  | { type: "ChartFinalized"; symbol: string; range?: string }
  | { type: "AssetStaticDataUpdated"; symbol: string }
  | { type: "DividendDataUpdated"; symbol: string };

export class CacheRegistryService {
  invalidate(event: CacheInvalidationEvent) {
    if (event.type === "portfolio-user-changed") {
      this.invalidateUserAssetCaches(event.userId, event.symbol);
      return;
    }
    if (event.type === "portfolio-all-users-changed") {
      this.invalidateAllPortfolioCaches(event.symbol);
      return;
    }
    if (event.type === "frontend-block-changed") {
      this.invalidateFrontendBlock(event.userId, event.block);
      return;
    }
    if (event.type === "PositionChanged" || event.type === "TransactionChanged") {
      this.invalidateUserAssetCaches(String(event.userId), event.symbol);
      return;
    }
    if (event.type === "MarketSnapshotUpdated") {
      cacheRepository.invalidateAssetMarket(event.symbol);
      this.invalidateAllPortfolioCaches(event.symbol);
      return;
    }
    if (event.type === "ChartFinalized") {
      this.invalidateAllPortfolioCaches(event.symbol);
      return;
    }
    if (event.type === "AssetStaticDataUpdated") {
      cacheRepository.invalidateAssetStatic(event.symbol);
      cacheRepository.invalidateAssetArticles(event.symbol);
      this.invalidateFrontendBlock(undefined, "watchlist");
      return;
    }
    // Dernier type d'evenement restant : DividendDataUpdated.
    cacheRepository.invalidateAssetDividends(event.symbol);
    this.invalidateFrontendBlock(undefined, "dividends");
    this.invalidateFrontendBlock(undefined, "analysis");
  }

  private invalidateUserAssetCaches(userId: string, symbol?: string) {
    cacheRepository.invalidatePortfolioUser(userId, symbol);
  }

  private invalidateAllPortfolioCaches(symbol?: string) {
    cacheRepository.invalidatePortfolioAll(symbol);
  }

  private invalidateFrontendBlock(userId?: string | number, block?: string) {
    cacheRepository.invalidateFrontendBlock(userId, block);
  }
}

export const cacheRegistry = new CacheRegistryService();
