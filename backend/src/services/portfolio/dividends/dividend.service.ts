import type { DividendEvent, PortfolioDividendEvent, PortfolioDividends, PositionWithMarket } from "@pea/shared";
import { config } from "../../../config.js";
import { readNextEventDate } from "../../../repositories/calendar-events/calendar-events.repository.js";
import { requireUserId } from "../../auth/user-context.js";
import { chartConfigService } from "../../market/charts/chart-config.service.js";
import { dividendsService } from "../../market/dividends/dividends.service.js";
import { frontendBlockCache } from "../../shared/frontend-block-cache.service.js";
import { logger } from "../../shared/logger.service.js";
import { readCachedFundamentalsSummary } from "../../yahoo/fundamentals/fundamentals.job.js";
import { marketInfoFromSummary } from "../../yahoo/fundamentals/mappers/market-info.mapper.js";
import { buildTransactionCache, getQuantityAtTime } from "../portfolio-calculations.js";
import { portfolioService } from "../portfolio.service.js";
import { dividendMetrics, realDividendEvents, upcomingDividendEvents } from "./dividend-events.js";

/** Taux de distribution lu dans le cache fundamentals, sans appel Yahoo. */
function cachedPayoutRatio(symbol: string) {
  const cached = readCachedFundamentalsSummary(symbol);
  return cached ? marketInfoFromSummary(cached.data).payoutRatio : undefined;
}

function readPositionDividends(position: PositionWithMarket): { dividends: DividendEvent[]; failed: boolean } {
  try {
    return { dividends: dividendsService.readDividends(position.symbol), failed: false };
  } catch (error) {
    logger.warn("market-data", "Lecture des dividendes impossible", { symbol: position.symbol, error: error instanceof Error ? error.message : String(error) });
    return { dividends: [], failed: true };
  }
}

export class DividendService {
  async portfolioDividends(userId?: number | string, now = new Date()): Promise<PortfolioDividends> {
    const resolvedUserId = requireUserId(userId);
    const cacheUserId = String(resolvedUserId);
    if (config.enableMarketLiveRefresh) {
      const cached = frontendBlockCache.read(cacheUserId, "dividends") as PortfolioDividends | undefined;
      if (cached) return cached;
    }
    const summary = await portfolioService.summary("1d", resolvedUserId);
    const upcoming: PortfolioDividendEvent[] = [];
    const past: PortfolioDividendEvent[] = [];
    const currentYear = now.getFullYear();
    let stale = summary.positions.some((position) => position.quote?.stale);

    // Charge toutes les transactions en une passe pour éviter N×M requêtes DB
    // (hasDatedTransactions + getQuantityHeldAtDate pour chaque position × dividende).
    const txCache = buildTransactionCache(summary.positions.map((p) => p.id));

    for (const position of summary.positions) {
      const { dividends, failed } = readPositionDividends(position);
      stale ||= failed;
      const entry = txCache.get(position.id);
      const input = {
        position,
        dividends,
        metrics: dividendMetrics(position, cachedPayoutRatio(position.symbol)),
        quantityAt: (time: number) => (entry?.hasDated ? getQuantityAtTime(entry.transactions, time) : position.quantity),
        now,
        nextExDividendDate: readNextEventDate(position.symbol, "ex_dividend", now.toISOString())
      };
      past.push(...realDividendEvents(input));
      upcoming.push(...upcomingDividendEvents(input));
    }

    const nextEvents = upcoming
      .filter((event) => new Date(event.date).getFullYear() >= currentYear)
      .sort((a, b) => a.date.localeCompare(b.date));

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = `${currentYear}-${String(index + 1).padStart(2, "0")}`;
      return {
        month,
        amount: nextEvents
          .filter((event) => event.date.startsWith(month))
          .reduce((sum, event) => sum + event.totalAmount, 0)
      };
    });

    const expectedIncomes = summary.positions.map((position) => position.estimatedAnnualDividend).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const payload: PortfolioDividends = {
      annualEstimatedTotal: months.reduce((sum, month) => sum + month.amount, 0),
      currency: "EUR",
      months,
      upcoming: nextEvents,
      past: past.sort((a, b) => b.date.localeCompare(a.date)),
      expectedAnnualIncome: expectedIncomes.length ? expectedIncomes.reduce((sum, value) => sum + value, 0) : undefined,
      marketValue: summary.totalValue,
      stale
    };
    if (config.enableMarketLiveRefresh) frontendBlockCache.write(cacheUserId, "dividends", payload, chartConfigService.getSnapshotRefreshIntervalMs());
    return payload;
  }
}

export const dividendService = new DividendService();
