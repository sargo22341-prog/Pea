import { cacheRepository } from "../../repositories/cache/cache.repository.js";

export type CacheInvalidationEvent =
  | { type: "portfolio-user-changed"; userId: string; symbol?: string }
  | { type: "portfolio-all-users-changed"; symbol?: string }
  | { type: "frontend-block-changed"; userId?: string | number; block?: string };

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
    }
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
