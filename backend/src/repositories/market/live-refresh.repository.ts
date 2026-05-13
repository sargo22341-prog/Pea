import { db } from "../../db.js";

export class LiveRefreshRepository {
  portfolioUserIdsForSymbols(symbols: string[]): Array<string | number> {
    if (!symbols.length) return [];
    const placeholders = symbols.map(() => "?").join(",");
    const rows = db.prepare(`SELECT DISTINCT user_id FROM positions WHERE symbol IN (${placeholders})`).all(...symbols) as Array<{ user_id: string | number }>;
    return rows.map((row) => row.user_id);
  }

  portfolioSymbolsForSymbols(symbols: string[]): string[] {
    if (!symbols.length) return [];
    const placeholders = symbols.map(() => "?").join(",");
    const rows = db.prepare(`SELECT DISTINCT symbol FROM positions WHERE symbol IN (${placeholders})`).all(...symbols) as Array<{ symbol: string }>;
    return rows.map((row) => String(row.symbol).toUpperCase());
  }
}

export const liveRefreshRepository = new LiveRefreshRepository();
