import { summarizeDividendGrowth, type DividendGrowthSummary, type PortfolioDividendEvent } from "@pea/shared";
import type { DividendOverviewEvent } from "./projectDividendYear";

/**
 * Croissance du dividende de chaque actif, calculée sur ses détachements réels (historique complet
 * de l'actif, indépendant de la date d'achat) avec la règle partagée.
 */
export function dividendGrowthBySymbol(past: readonly PortfolioDividendEvent[], currentYear: number): Map<string, DividendGrowthSummary> {
  const eventsBySymbol = new Map<string, { date: string; amount: number }[]>();
  for (const event of past) {
    if (event.status !== "real") continue;
    const events = eventsBySymbol.get(event.symbol) ?? [];
    events.push({ date: event.date, amount: event.amountPerShare });
    eventsBySymbol.set(event.symbol, events);
  }
  return new Map([...eventsBySymbol].map(([symbol, events]) => [symbol, summarizeDividendGrowth(events, currentYear)]));
}

export interface DividendStatusTotals {
  real: number;
  announced: number;
  /** Estimations reconduites de l'an dernier et projections de l'année suivante. */
  estimated: number;
}

/** Répartition du total d'une année selon la fiabilité des montants. */
export function dividendStatusTotals(events: readonly DividendOverviewEvent[], year: number): DividendStatusTotals {
  const totals: DividendStatusTotals = { real: 0, announced: 0, estimated: 0 };
  for (const event of events) {
    if (event.year !== year || !Number.isFinite(event.totalAmount)) continue;
    const key = event.projected ? "estimated" : event.status;
    totals[key] += event.totalAmount;
  }
  return totals;
}
