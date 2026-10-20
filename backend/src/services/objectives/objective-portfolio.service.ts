import type { ObjectiveContributionPoint, ObjectiveSeriesPoint } from "@pea/shared";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { portfolioService } from "../portfolio/portfolio.service.js";
import { cashAccountService } from "../cash/cash-account.service.js";
import { centsToMoney, entryTimeMs } from "../cash/cash-ledger.js";

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
        const amount = transaction.quantity * transaction.price + (transaction.total_fees ?? 0);
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
          real: Math.max(0, point.value || 0)
        };
      });

    // Épargne mensuelle : flux externes du journal espèces (versements - retraits) dès qu'ils sont
    // connus. Avant l'état initial (ou tant qu'il n'est pas confirmé), seuls les achats nets des
    // ventes donnent une estimation : un réinvestissement n'y est pas compté deux fois.
    const cash = cashAccountService.load(userId);
    const ready = cash.account.status === "ready";
    const ledgerStartMs = ready && cash.account.reference_at ? entryTimeMs(cash.account.reference_at) : ready ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    for (const transaction of sorted) {
      const date = new Date(transaction.traded_at);
      if (!Number.isFinite(date.getTime()) || date.getTime() > ledgerStartMs) continue;
      const amount = transaction.quantity * transaction.price + (transaction.total_fees ?? 0);
      const signed = transaction.type === "sell" ? -amount : amount;
      monthly.set(monthKey(date), (monthly.get(monthKey(date)) ?? 0) + signed);
    }
    for (const entry of cash.result.entries) {
      if ((entry.kind !== "deposit" && entry.kind !== "withdrawal") || entry.absorbed || entryTimeMs(entry.effectiveAt) <= ledgerStartMs) continue;
      const date = new Date(entry.effectiveAt);
      monthly.set(monthKey(date), (monthly.get(monthKey(date)) ?? 0) + centsToMoney(entry.amountCents));
    }

    const months = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
    const positiveMonths = months.filter(([, amount]) => amount > 0);
    const averageMonthlySavings = positiveMonths.length
      ? positiveMonths.reduce((sum, [, amount]) => sum + amount, 0) / positiveMonths.length
      : 0;

    return {
      // Capital actuel : valeur du PEA espèces comprises, dès que le solde espèces est connu.
      currentCapital: summary.pea?.status === "ready" ? summary.pea.totalValue : summary.totalValue,
      realSeries,
      contributions: months.map(([month, amount]) => ({ month, amount, kind: "real" })),
      averageMonthlySavings
    };
  }
}

export const objectivePortfolioService = new ObjectivePortfolioService();
