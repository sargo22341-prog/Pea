import type { ObjectiveContributionPoint, ObjectiveSeriesPoint } from "@pea/shared";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { portfolioService } from "../portfolio/portfolio.service.js";

export interface ObjectivePortfolioSnapshot {
  currentCapital: number;
  realSeries: ObjectiveSeriesPoint[];
  contributions: ObjectiveContributionPoint[];
  averageMonthlySavings: number;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function dayStartTime(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export class ObjectivePortfolioService {
  async snapshot(userId: number, currentAge?: number): Promise<ObjectivePortfolioSnapshot> {
    const summary = await portfolioService.summary("1d", userId);
    const performance = await portfolioService.performance("all", {}, userId);
    const transactions = portfolioRepository
      .listPositions(userId)
      .flatMap((position) => portfolioRepository.listTransactionSequence(position.id));
    const monthly = new Map<string, number>();
    const sorted = [...transactions].sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime());
    const now = new Date();
    const firstInvestmentTime = sorted
      .map((transaction) => {
        const date = new Date(transaction.traded_at);
        const amount = Number(transaction.quantity) * Number(transaction.price) + Number(transaction.total_fees ?? 0);
        const signed = transaction.type === "sell" ? -amount : amount;
        return signed > 0 && Number.isFinite(date.getTime()) ? dayStartTime(date) : undefined;
      })
      .find((time): time is number => time !== undefined);
    const realSeries: ObjectiveSeriesPoint[] = performance
      .filter((point) => {
        if (firstInvestmentTime === undefined) return true;
        const date = new Date(point.date);
        return Number.isFinite(date.getTime()) && dayStartTime(date) >= firstInvestmentTime;
      })
      .map((point) => {
        const date = new Date(point.date);
        return {
          date: point.date,
          age: currentAge === undefined || !Number.isFinite(date.getTime()) ? 0 : Math.max(0, currentAge - (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
          real: Math.max(0, Number(point.value) || 0)
        };
      });

    for (const transaction of sorted) {
      const date = new Date(transaction.traded_at);
      if (!Number.isFinite(date.getTime())) continue;
      const amount = Number(transaction.quantity) * Number(transaction.price) + Number(transaction.total_fees ?? 0);
      const signed = transaction.type === "sell" ? -amount : amount;
      monthly.set(monthKey(date), (monthly.get(monthKey(date)) ?? 0) + signed);
    }

    const months = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
    const positiveMonths = months.filter(([, amount]) => amount > 0);
    const averageMonthlySavings = positiveMonths.length
      ? positiveMonths.reduce((sum, [, amount]) => sum + amount, 0) / positiveMonths.length
      : 0;

    return {
      currentCapital: summary.totalValue,
      realSeries,
      contributions: months.map(([month, amount]) => ({ month, amount, kind: "real" })),
      averageMonthlySavings
    };
  }
}

export const objectivePortfolioService = new ObjectivePortfolioService();
