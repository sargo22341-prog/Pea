import type { DividendEvent, PortfolioDividendEvent, PortfolioDividends, PositionWithMarket } from "@pea/shared";
import { HttpError } from "../utils/http-error.js";
import { portfolioService } from "./portfolio.service.js";
import { yahooService } from "./yahoo.service.js";

function addOneYear(date: string): string {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
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
    const positions = await portfolioService.summary();
    const upcoming: PortfolioDividendEvent[] = [];
    const past: PortfolioDividendEvent[] = [];
    const currentYear = new Date().getFullYear();
    let stale = positions.positions.some((position) => position.quote?.stale);

    for (const position of positions.positions) {
      const metrics = dividendMetrics(position);
      let dividends: DividendEvent[] = [];
      try {
        const dividendResult = await yahooService.dividends(position.symbol);
        dividends = dividendResult.data;
        stale = stale || dividendResult.stale;
      } catch (error) {
        if (!(error instanceof HttpError && [429, 502].includes(error.status))) {
          throw error;
        }
        stale = true;
      }

      const lastYear = currentYear - 1;
      const lastYearDividends = dividends.filter((event) => new Date(event.date).getFullYear() === lastYear);

      for (const event of dividends) {
        const year = new Date(event.date).getFullYear();
        const amountPerShare = event.amount;
        const quantity = portfolioService.hasDatedTransactions(position.id)
          ? portfolioService.getQuantityHeldAtDate(position.id, event.date)
          : position.quantity;
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
        const amountPerShare = event.amount;
        const quantity = portfolioService.hasDatedTransactions(position.id)
          ? portfolioService.getQuantityHeldAtDate(position.id, date)
          : position.quantity;
        upcoming.push({
          symbol: position.symbol,
          name: position.name,
          date,
          year: new Date(date).getFullYear(),
          amountPerShare,
          quantity,
          totalAmount: amountPerShare * quantity,
          currency: event.currency,
          status: "estimated",
          ...metrics,
          stale: event.stale
        });
      }

      if (!lastYearDividends.length && position.estimatedAnnualDividend) {
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

    return {
      annualEstimatedTotal: months.reduce((sum, month) => sum + month.amount, 0),
      currency: "EUR",
      months,
      upcoming: nextEvents,
      past: past.sort((a, b) => b.date.localeCompare(a.date)),
      stale
    };
  }
}

export const dividendService = new DividendService();
