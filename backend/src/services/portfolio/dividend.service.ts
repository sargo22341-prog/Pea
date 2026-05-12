/**
 * Role du fichier : calculer les dividendes passes et estimes au niveau du
 * portefeuille a partir des positions et des evenements stockes.
 */

import type { DividendEvent, PortfolioDividendEvent, PortfolioDividends, PositionWithMarket } from "@pea/shared";
import { config } from "../../config.js";
import { currentUserId } from "../auth/user-context.js";
import { frontendBlockCache } from "../shared/frontend-block-cache.service.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { buildTransactionCache, getQuantityAtTime } from "./portfolio-calculations.js";
import { portfolioService } from "./portfolio.service.js";
import { dividendsService } from "../market/dividends/dividends.service.js";

function addOneYear(date: string): string {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
}

function yearFromDate(date: string): number | undefined {
  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? year : undefined;
}

function yearMonthFromDate(date: string): string | undefined {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function dividendMetrics(position: PositionWithMarket) {
  const annualDividendRate = position.quote?.dividendRate;
  const hasAnnualDividendRate = Number.isFinite(annualDividendRate);
  const dividendPercent =
    hasAnnualDividendRate && position.currentPrice ? (Number(annualDividendRate) / position.currentPrice) * 100 : undefined;
  const yieldOnCostPercent =
    hasAnnualDividendRate && position.averageBuyPrice ? (Number(annualDividendRate) / position.averageBuyPrice) * 100 : undefined;

  return {
    annualDividendRate,
    dividendPercent,
    yieldOnCostPercent
  };
}

export class DividendService {
  async portfolioDividends(): Promise<PortfolioDividends> {
    const userId = currentUserId().toString();
    if (config.enableMarketLiveRefresh) {
      const cached = frontendBlockCache.read<PortfolioDividends>(userId, "dividends");
      if (cached) return cached;
    }
    const positions = await portfolioService.summary();
    const upcoming: PortfolioDividendEvent[] = [];
    const past: PortfolioDividendEvent[] = [];
    const currentYear = new Date().getFullYear();
    let stale = positions.positions.some((position) => position.quote?.stale);

    // Charge toutes les transactions en une passe pour éviter N×M requêtes DB
    // (hasDatedTransactions + getQuantityHeldAtDate pour chaque position × dividende).
    const txCache = buildTransactionCache(positions.positions.map((p) => p.id));

    for (const position of positions.positions) {
      const metrics = dividendMetrics(position);
      let dividends: DividendEvent[] = [];
      try {
        dividends = dividendsService.readDividends(position.symbol);
      } catch {
        stale = true;
      }

      const entry = txCache.get(position.id);
      const realDividendYears = new Set(dividends.map((event) => yearFromDate(event.date)).filter((year): year is number => year !== undefined));
      const realDividendPeriods = new Set(dividends.map((event) => yearMonthFromDate(event.date)).filter((period): period is string => period !== undefined));
      const lastYear = currentYear - 1;
      const lastYearDividends = dividends.filter((event) => yearFromDate(event.date) === lastYear);

      for (const event of dividends) {
        const year = new Date(event.date).getFullYear();
        const amountPerShare = event.amount;
        const eventTime = new Date(event.date).getTime();
        const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, eventTime) : position.quantity;
        past.push({
          symbol: position.symbol,
          name: position.name,
          date: event.date,
          year,
          amountPerShare,
          quantity,
          totalAmount: amountPerShare * quantity,
          currency: event.currency,
          status: "real",
          ...metrics,
          stale: event.stale
        });
      }

      for (const event of lastYearDividends) {
        const date = addOneYear(event.date);
        const estimatedYear = yearFromDate(date);
        const estimatedPeriod = yearMonthFromDate(date);
        if (estimatedYear === undefined || estimatedPeriod === undefined || realDividendPeriods.has(estimatedPeriod)) continue;
        const amountPerShare = event.amount;
        const estimatedTime = new Date(date).getTime();
        const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, estimatedTime) : position.quantity;
        upcoming.push({
          symbol: position.symbol,
          name: position.name,
          date,
          year: estimatedYear,
          amountPerShare,
          quantity,
          totalAmount: amountPerShare * quantity,
          currency: event.currency,
          status: "estimated",
          ...metrics,
          stale: event.stale
        });
      }

      if (!lastYearDividends.length && !realDividendYears.has(currentYear) && position.estimatedAnnualDividend) {
        const amountPerShare = position.quantity ? position.estimatedAnnualDividend / position.quantity : 0;
        upcoming.push({
          symbol: position.symbol,
          name: position.name,
          date: new Date(currentYear, 11, 31).toISOString(),
          year: currentYear,
          amountPerShare,
          quantity: position.quantity,
          totalAmount: position.estimatedAnnualDividend,
          currency: position.currency,
          status: "estimated",
          ...metrics
        });
      }
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

    const payload = {
      annualEstimatedTotal: months.reduce((sum, month) => sum + month.amount, 0),
      currency: "EUR",
      months,
      upcoming: nextEvents,
      past: past.sort((a, b) => b.date.localeCompare(a.date)),
      stale
    };
    if (config.enableMarketLiveRefresh) frontendBlockCache.write(userId, "dividends", payload, chartConfigService.getSnapshotRefreshIntervalMs());
    return payload;
  }
}

export const dividendService = new DividendService();
