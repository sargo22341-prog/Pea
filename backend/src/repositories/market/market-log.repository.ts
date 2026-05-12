import { db } from "../../db.js";
import { nowIso } from "../../schedulers/market-task.utils.js";

export class MarketLogRepository {
  insert(input: {
    marketKey: string;
    tradingDate: string;
    phase: "open" | "close";
    checkedAt: string;
    expectedAt?: string | null;
    yahooMarketState?: string | null;
    success: boolean;
    partialSuccess: boolean;
    message?: string | null;
    symbolsCount: number;
    validSymbolsCount: number;
    failedSymbolsCount: number;
  }) {
    db.prepare(
      `INSERT INTO market_check_logs (
        market_key, trading_date, phase, checked_at, expected_at, yahoo_market_state, success, partial_success,
        message, symbols_count, valid_symbols_count, failed_symbols_count, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.marketKey,
      input.tradingDate,
      input.phase,
      input.checkedAt,
      input.expectedAt ?? null,
      input.yahooMarketState ?? null,
      input.success ? 1 : 0,
      input.partialSuccess ? 1 : 0,
      input.message ?? null,
      input.symbolsCount,
      input.validSymbolsCount,
      input.failedSymbolsCount,
      nowIso()
    );
  }

  cleanupOlderThan(days: number, now = new Date()) {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    return db.prepare("DELETE FROM market_check_logs WHERE created_at < ?").run(cutoff);
  }
}

export const marketLogRepository = new MarketLogRepository();
