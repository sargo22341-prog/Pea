/**
 * Role du fichier : supprimer uniquement les donnees de marche reconstruites.
 * Les utilisateurs, transactions, positions, watchlist et preferences ne sont pas touches.
 */

import { db } from "../../db.js";

export class MarketDataCleaner {
  deleteMarketData() {
    const tables = [
      "chart_candles",
      "asset_market_snapshots",
      "asset_financials",
      "asset_dividends",
      "asset_static_cache",
      "asset_chart_cache",
      "asset_market_cache",
      "asset_dividend_cache",
      "portfolio_chart_cache",
      "cached_quotes",
      "cached_history",
      "cached_intraday_history",
      "cached_dividends",
      "cached_fundamentals"
    ];
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    return { clearedTables: tables };
  }
}

export const marketDataCleaner = new MarketDataCleaner();
