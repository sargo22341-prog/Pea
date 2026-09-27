import type { AssetChartDto } from "@pea/shared";
import { applyTransaction, transactionTimeMs, type ReplayedHolding, type TransactionRow } from "./portfolio-calculations.js";

/**
 * Série de prix en timestamps numériques, triée par instant croissant. Les calculs de courbes
 * travaillent sur ce format pour éviter les allers-retours timestamp → chaîne ISO → Date.
 */
export interface PriceSeries {
  times: number[];
  closes: number[];
}

export const emptyPriceSeries: PriceSeries = { times: [], closes: [] };

/** Extrait les points exploitables d'un DTO de graphique, triés par instant. */
export function chartPriceSeries(chart: Pick<AssetChartDto, "timestamps" | "prices">): PriceSeries {
  const points: { time: number; close: number }[] = [];
  let sorted = true;
  for (let index = 0; index < chart.timestamps.length; index += 1) {
    const time = chart.timestamps[index];
    const close = chart.prices[index];
    if (time === undefined || close === undefined || !Number.isFinite(time) || !Number.isFinite(close)) continue;
    const previous = points.at(-1);
    if (previous && previous.time > time) sorted = false;
    points.push({ time, close });
  }
  if (!sorted) points.sort((a, b) => a.time - b.time);
  return { times: points.map((point) => point.time), closes: points.map((point) => point.close) };
}

/** Dernier instant d'une série (0 si vide). */
export function lastSeriesTime(series: PriceSeries) {
  return series.times.at(-1) ?? 0;
}

/**
 * Rejoue les transactions d'une position au fil d'instants croissants. Chaque appel à
 * `advanceTo` n'applique que les transactions nouvellement atteintes : une courbe de N points
 * coûte O(N + transactions) au lieu de rejouer tout l'historique à chaque point.
 * Les règles de calcul restent celles de `applyTransaction` (source de vérité unique).
 */
export class TransactionReplayCursor {
  private readonly times: number[];
  private index = 0;
  private lastTimeMs = Number.NEGATIVE_INFINITY;
  readonly holding: ReplayedHolding = { quantity: 0, costBasis: 0 };

  constructor(private readonly transactions: TransactionRow[]) {
    this.times = transactions.map((transaction) => transactionTimeMs(transaction.traded_at));
  }

  advanceTo(timeMs: number): ReplayedHolding {
    if (timeMs < this.lastTimeMs) throw new Error("TransactionReplayCursor: les instants doivent être croissants");
    this.lastTimeMs = timeMs;
    while (this.index < this.transactions.length) {
      const time = this.times[this.index];
      const transaction = this.transactions[this.index];
      if (time === undefined || transaction === undefined || time > timeMs) break;
      applyTransaction(this.holding, transaction);
      this.index += 1;
    }
    return this.holding;
  }
}
