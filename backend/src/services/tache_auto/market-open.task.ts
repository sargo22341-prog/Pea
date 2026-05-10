import type { Quote } from "@pea/shared";
import { yahooApi } from "../yahoo/yahoo.api.js";
import type { YahooSnapshotPayload } from "../yahoo/yahoo.mapper.js";
import { assetRepository, type AssetRow } from "../market/asset.repository.js";
import { marketSnapshotService } from "../market/market-snapshot.service.js";
import { isMarketOpen } from "../market/marketCalendar.service.js";
import { logger } from "../shared/logger.service.js";
import { marketLogRepository } from "./market-log.repository.js";
import { marketRunRepository, type MarketDailyRunRow } from "./market-run.repository.js";
import {
  MARKET_RETRY_MINUTES,
  MARKET_STOP_AFTER_MINUTES,
  expectedTimes,
  isWeekend,
  localTradingDate,
  minutesAfter,
  nowIso,
  type MarketAssetGroup
} from "./market-task.utils.js";

const terminalOpenStatuses = new Set(["confirmed_open", "confirmed_open_partial", "holiday_suspected", "missed_open_window", "skipped_weekend", "skipped_no_assets"]);

interface BatchAnalysis {
  valid: { quote: Quote; snapshot: YahooSnapshotPayload; asset: AssetRow }[];
  failedSymbols: string[];
  anyOpen: boolean;
  marketStates: string[];
}

export class MarketOpenTask {
  async run(group: MarketAssetGroup, now = new Date()) {
    const local = localTradingDate(now, group.calendar.timezone);
    const weekend = isWeekend(local.weekday);
    const times = expectedTimes(group.calendar, local.isoDate);
    const run = marketRunRepository.ensure({
      marketKey: group.marketKey,
      tradingDate: local.isoDate,
      timezone: group.calendar.timezone,
      assetsCount: group.assets.length,
      openExpectedAt: times.openExpectedAt,
      closeExpectedAt: times.closeExpectedAt,
      skippedWeekend: weekend,
      skippedNoAssets: group.assets.length === 0
    });

    if (weekend || group.assets.length === 0 || terminalOpenStatuses.has(run.open_status)) return;
    if (now.getTime() < times.openExpectedAt.getTime()) return;
    if (run.next_open_check_at && now.getTime() < new Date(run.next_open_check_at).getTime()) return;

    const stopAt = minutesAfter(times.openExpectedAt, MARKET_STOP_AFTER_MINUTES);
    const noOpenCheckWasObserved = run.open_attempts === 0 && !run.open_last_checked_at;
    if (now.getTime() > stopAt.getTime() && now.getTime() >= times.closeExpectedAt.getTime() && noOpenCheckWasObserved) {
      marketRunRepository.updateOpen(run.id, {
        open_status: "missed_open_window",
        open_status_message: "Fenetre de verification d'ouverture manquee apres demarrage tardif",
        next_open_check_at: null
      });
      marketLogRepository.insert({
        marketKey: group.marketKey,
        tradingDate: run.trading_date,
        phase: "open",
        checkedAt: nowIso(now),
        expectedAt: times.openExpectedAt.toISOString(),
        success: false,
        partialSuccess: false,
        message: "missed_open_window",
        symbolsCount: group.assets.length,
        validSymbolsCount: 0,
        failedSymbolsCount: 0
      });
      return;
    }

    if (now.getTime() > stopAt.getTime() && run.open_attempts > 0) {
      marketRunRepository.updateOpen(run.id, {
        open_status: "holiday_suspected",
        open_status_message: "Ouverture non confirmee apres 1h, jour ferie probable",
        next_open_check_at: null
      });
      return;
    }

    await this.checkOpen(group, run, times.openExpectedAt, now);
  }

  private async checkOpen(group: MarketAssetGroup, run: MarketDailyRunRow, expectedAt: Date, now: Date) {
    const symbols = group.assets.map((asset) => asset.symbol);
    const checkedAt = nowIso(now);
    marketRunRepository.updateOpen(run.id, { open_status: "checking", open_last_checked_at: checkedAt });

    let rows: { quote: Quote; snapshot: YahooSnapshotPayload }[];
    try {
      rows = await yahooApi.quoteBatchRaw(symbols);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      marketRunRepository.updateOpen(run.id, {
        open_status: "failed",
        open_last_error: message,
        open_last_checked_at: checkedAt,
        next_open_check_at: minutesAfter(now, MARKET_RETRY_MINUTES).toISOString(),
        open_status_message: "Erreur technique Yahoo, nouvelle tentative planifiee",
        incrementAttempts: true
      });
      marketLogRepository.insert({
        marketKey: group.marketKey,
        tradingDate: run.trading_date,
        phase: "open",
        checkedAt,
        expectedAt: expectedAt.toISOString(),
        success: false,
        partialSuccess: false,
        message,
        symbolsCount: symbols.length,
        validSymbolsCount: 0,
        failedSymbolsCount: symbols.length
      });
      logger.warn("market-data", "market open batch failed", { market: group.marketKey, symbols: symbols.length, error: message });
      return;
    }

    const analysis = this.analyzeBatch(group.assets, rows);
    for (const item of analysis.valid) {
      marketSnapshotService.storeBatchSnapshot(item.asset, item.quote, item.snapshot);
    }

    const partial = analysis.failedSymbols.length > 0;
    const yahooMarketState = analysis.marketStates.join(",");
    if (analysis.valid.length > 0 && analysis.anyOpen) {
      marketRunRepository.updateOpen(run.id, {
        open_status: partial ? "confirmed_open_partial" : "confirmed_open",
        open_confirmed_at: checkedAt,
        open_last_checked_at: checkedAt,
        next_open_check_at: null,
        open_last_error: partial ? `Symboles sans reponse: ${analysis.failedSymbols.join(", ")}` : null,
        open_status_message: partial ? "Ouverture confirmee avec erreurs partielles" : "Ouverture confirmee",
        incrementAttempts: true
      });
      marketLogRepository.insert({
        marketKey: group.marketKey,
        tradingDate: run.trading_date,
        phase: "open",
        checkedAt,
        expectedAt: expectedAt.toISOString(),
        yahooMarketState,
        success: true,
        partialSuccess: partial,
        message: partial ? `Symboles sans reponse: ${analysis.failedSymbols.join(", ")}` : "Ouverture confirmee",
        symbolsCount: symbols.length,
        validSymbolsCount: analysis.valid.length,
        failedSymbolsCount: analysis.failedSymbols.length
      });
      return;
    }

    const stopAt = minutesAfter(expectedAt, MARKET_STOP_AFTER_MINUTES);
    const exhausted = now.getTime() >= stopAt.getTime();
    marketRunRepository.updateOpen(run.id, {
      open_status: exhausted ? "holiday_suspected" : "pending",
      open_last_checked_at: checkedAt,
      next_open_check_at: exhausted ? null : minutesAfter(now, MARKET_RETRY_MINUTES).toISOString(),
      open_status_message: exhausted ? "Yahoo indique ferme apres 1h, jour ferie probable" : "Yahoo indique ferme, nouvelle tentative planifiee",
      incrementAttempts: true
    });
    marketLogRepository.insert({
      marketKey: group.marketKey,
      tradingDate: run.trading_date,
      phase: "open",
      checkedAt,
      expectedAt: expectedAt.toISOString(),
      yahooMarketState,
      success: false,
      partialSuccess: partial,
      message: exhausted ? "holiday_suspected" : "all-valid-symbols-closed",
      symbolsCount: symbols.length,
      validSymbolsCount: analysis.valid.length,
      failedSymbolsCount: analysis.failedSymbols.length
    });
  }

  private analyzeBatch(assets: AssetRow[], rows: { quote: Quote; snapshot: YahooSnapshotPayload }[]): BatchAnalysis {
    const bySymbol = new Map(rows.map((row) => [row.quote.symbol.toUpperCase(), row]));
    const valid: BatchAnalysis["valid"] = [];
    const failedSymbols: string[] = [];
    const marketStates: string[] = [];
    for (const asset of assets) {
      const row = bySymbol.get(asset.symbol.toUpperCase());
      if (!row) {
        failedSymbols.push(asset.symbol);
        continue;
      }
      const storedAsset = assetRepository.findBySymbol(row.quote.symbol) ?? asset;
      valid.push({ ...row, asset: storedAsset });
      if (row.quote.marketState) marketStates.push(String(row.quote.marketState));
    }
    return {
      valid,
      failedSymbols,
      anyOpen: valid.some((row) => isMarketOpen(row.quote.marketState)),
      marketStates: [...new Set(marketStates)]
    };
  }
}

export const marketOpenTask = new MarketOpenTask();
