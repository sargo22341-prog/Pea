import { db } from "../../db.js";

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
    if (symbol) {
      db.prepare("DELETE FROM user_assets WHERE user_id = ? AND symbol = ?").run(userId, symbol.toUpperCase());
    } else {
      db.prepare("DELETE FROM user_assets WHERE user_id = ?").run(userId);
    }
    db.prepare("DELETE FROM portfolio_chart_cache WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM portfolio_positions_performance_cache WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM frontend_block_cache WHERE user_id = ?").run(userId);
  }

  private invalidateAllPortfolioCaches(symbol?: string) {
    if (symbol) {
      db.prepare("DELETE FROM user_assets WHERE symbol = ?").run(symbol.toUpperCase());
    } else {
      db.prepare("DELETE FROM user_assets").run();
    }
    db.prepare("DELETE FROM portfolio_chart_cache").run();
    db.prepare("DELETE FROM portfolio_positions_performance_cache").run();
    db.prepare("DELETE FROM frontend_block_cache").run();
  }

  private invalidateFrontendBlock(userId?: string | number, block?: string) {
    if (userId && block) {
      db.prepare("DELETE FROM frontend_block_cache WHERE user_id = ? AND block = ?").run(String(userId), block);
      return;
    }
    if (userId) {
      db.prepare("DELETE FROM frontend_block_cache WHERE user_id = ?").run(String(userId));
      return;
    }
    if (block) {
      db.prepare("DELETE FROM frontend_block_cache WHERE block = ?").run(block);
      return;
    }
    db.prepare("DELETE FROM frontend_block_cache").run();
  }
}

export const cacheRegistry = new CacheRegistryService();
