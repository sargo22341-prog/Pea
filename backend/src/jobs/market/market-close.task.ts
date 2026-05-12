import type { Quote } from "@pea/shared";
import { yahooApi } from "../../services/yahoo/yahoo.api.js";
import type { YahooSnapshotPayload } from "../../services/yahoo/yahoo.mapper.js";
import { assetRepository, type AssetRow } from "../../repositories/market/asset.repository.js";
import { dataConstructionQueue } from "../../services/market/construction/data-construction-queue.service.js";
import { marketSnapshotService } from "../../services/market/snapshots/market-snapshot.service.js";
import { isMarketOpen } from "../../services/market/calendars/marketCalendar.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { marketLogRepository } from "../../repositories/market/market-log.repository.js";
import { marketRunRepository, type MarketDailyRunRow } from "../../repositories/market/market-run.repository.js";
import {
  CLOSE_BUFFER_MINUTES,
  MARKET_RETRY_MINUTES,
  MARKET_STOP_AFTER_MINUTES,
  expectedTimes,
  isWeekend,
  localTradingDate,
  minutesAfter,
  nowIso,
  type MarketAssetGroup
} from "../../schedulers/market-task.utils.js";

const terminalCloseStatuses = new Set(["confirmed_closed", "confirmed_closed_partial", "close_not_confirmed", "skipped_weekend", "skipped_no_assets"]);

interface BatchAnalysis {
  valid: { quote: Quote; snapshot: YahooSnapshotPayload; asset: AssetRow }[];
  failedSymbols: string[];
  anyOpen: boolean;
  marketStates: string[];
}

export class MarketCloseTask {
  async run(group: MarketAssetGroup, now = new Date()) {
    const local = localTradingDate(now, group.calendar.timezone);
    const weekend = isWeekend(local.weekday);
    const times = expectedTimes(group.calendar, local.isoDate);
    const firstCheckAt = minutesAfter(times.closeExpectedAt, CLOSE_BUFFER_MINUTES);
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

    if (weekend || group.assets.length === 0 || terminalCloseStatuses.has(run.close_status)) return;
    if (now.getTime() < firstCheckAt.getTime()) return;
    if (run.next_close_check_at && now.getTime() < new Date(run.next_close_check_at).getTime()) return;

    const stopAt = minutesAfter(firstCheckAt, MARKET_STOP_AFTER_MINUTES);
    if (now.getTime() > stopAt.getTime() && run.close_attempts > 0) {
      marketRunRepository.updateClose(run.id, {
        close_status: "close_not_confirmed",
        close_status_message: "Cloture non confirmee apres 1h",
        next_close_check_at: null
      });
      return;
    }

    await this.checkClose(group, run, times.closeExpectedAt, firstCheckAt, now);
  }

  private async checkClose(group: MarketAssetGroup, run: MarketDailyRunRow, expectedAt: Date, firstCheckAt: Date, now: Date) {
    const symbols = group.assets.map((asset) => asset.symbol);
    const checkedAt = nowIso(now);
    marketRunRepository.updateClose(run.id, { close_status: "checking", close_last_checked_at: checkedAt });

    let rows: { quote: Quote; snapshot: YahooSnapshotPayload }[];
    try {
      rows = await yahooApi.quoteBatchRaw(symbols);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      marketRunRepository.updateClose(run.id, {
        close_status: "failed",
        close_last_error: message,
        close_last_checked_at: checkedAt,
        next_close_check_at: minutesAfter(now, MARKET_RETRY_MINUTES).toISOString(),
        close_status_message: "Erreur technique Yahoo, nouvelle tentative planifiee",
        incrementAttempts: true
      });
      marketLogRepository.insert({
        marketKey: group.marketKey,
        tradingDate: run.trading_date,
        phase: "close",
        checkedAt,
        expectedAt: expectedAt.toISOString(),
        success: false,
        partialSuccess: false,
        message,
        symbolsCount: symbols.length,
        validSymbolsCount: 0,
        failedSymbolsCount: symbols.length
      });
      logger.warn("market-data", "market close batch failed", { market: group.marketKey, symbols: symbols.length, error: message });
      return;
    }

    const analysis = this.analyzeBatch(group.assets, rows);
    for (const item of analysis.valid) {
      marketSnapshotService.storeBatchSnapshot(item.asset, item.quote, item.snapshot);
    }

    const partial = analysis.failedSymbols.length > 0;
    const yahooMarketState = analysis.marketStates.join(",");
    if (analysis.valid.length > 0 && !analysis.anyOpen) {
      const job = run.close_job_id
        ? undefined
        : dataConstructionQueue.enqueuePostCloseFinalization(group.assets.map((asset) => asset.symbol));
      marketRunRepository.updateClose(run.id, {
        close_status: partial ? "confirmed_closed_partial" : "confirmed_closed",
        close_confirmed_at: checkedAt,
        close_last_checked_at: checkedAt,
        next_close_check_at: null,
        close_last_error: partial ? `Symboles sans reponse: ${analysis.failedSymbols.join(", ")}` : null,
        close_status_message: partial ? "Cloture confirmee avec erreurs partielles" : "Cloture confirmee",
        close_job_id: run.close_job_id ?? job?.id ?? null,
        incrementAttempts: true
      });
      marketLogRepository.insert({
        marketKey: group.marketKey,
        tradingDate: run.trading_date,
        phase: "close",
        checkedAt,
        expectedAt: expectedAt.toISOString(),
        yahooMarketState,
        success: true,
        partialSuccess: partial,
        message: partial ? `Symboles sans reponse: ${analysis.failedSymbols.join(", ")}` : "Cloture confirmee",
        symbolsCount: symbols.length,
        validSymbolsCount: analysis.valid.length,
        failedSymbolsCount: analysis.failedSymbols.length
      });
      return;
    }

    const stopAt = minutesAfter(firstCheckAt, MARKET_STOP_AFTER_MINUTES);
    const exhausted = now.getTime() >= stopAt.getTime();
    marketRunRepository.updateClose(run.id, {
      close_status: exhausted ? "close_not_confirmed" : "pending",
      close_last_checked_at: checkedAt,
      next_close_check_at: exhausted ? null : minutesAfter(now, MARKET_RETRY_MINUTES).toISOString(),
      close_status_message: exhausted ? "Yahoo indique encore ouvert apres 1h" : "Yahoo indique encore ouvert, nouvelle tentative planifiee",
      incrementAttempts: true
    });
    marketLogRepository.insert({
      marketKey: group.marketKey,
      tradingDate: run.trading_date,
      phase: "close",
      checkedAt,
      expectedAt: expectedAt.toISOString(),
      yahooMarketState,
      success: false,
      partialSuccess: partial,
      message: exhausted ? "close_not_confirmed" : "some-valid-symbols-open",
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

export const marketCloseTask = new MarketCloseTask();
