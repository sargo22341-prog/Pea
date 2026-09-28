import { HIGH_CORRELATION_THRESHOLD, type CorrelationPair, type PortfolioCorrelation } from "@pea/shared";

/** Fenêtre de rendements journaliers utilisée (une année de bourse). */
export const CORRELATION_WINDOW_DAYS = 252;
/** Rendements communs minimaux pour qu'une corrélation soit significative (environ trois mois). */
export const CORRELATION_MIN_OBSERVATIONS = 60;
/** Lignes retenues, par poids décroissant : au-delà, la matrice devient illisible. */
export const CORRELATION_MAX_ASSETS = 20;

export interface CloseSeries {
  symbol: string;
  name: string;
  /** Clôtures journalières ; `day` au format AAAA-MM-JJ. */
  closes: readonly { day: string; close: number }[];
}

/** Coefficient de Pearson ; `null` si l'une des séries est constante (variance nulle). */
export function pearson(a: readonly number[], b: readonly number[]): number | null {
  const length = Math.min(a.length, b.length);
  if (length < 2) return null;
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < length; index += 1) {
    meanA += a[index] ?? 0;
    meanB += b[index] ?? 0;
  }
  meanA /= length;
  meanB /= length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < length; index += 1) {
    const deltaA = (a[index] ?? 0) - meanA;
    const deltaB = (b[index] ?? 0) - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }
  if (varianceA <= 0 || varianceB <= 0) return null;
  return Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceA * varianceB)));
}

function closesByDay(series: CloseSeries) {
  const byDay = new Map<string, number>();
  for (const point of series.closes) {
    if (Number.isFinite(point.close) && point.close > 0) byDay.set(point.day, point.close);
  }
  return byDay;
}

/**
 * Rendements des deux séries sur leurs séances communes (les jours fériés propres à une place sont
 * ignorés pour les deux), limités aux `window` derniers.
 */
export function alignedReturns(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, window = CORRELATION_WINDOW_DAYS) {
  const days = [...a.keys()].filter((day) => b.has(day)).sort().slice(-(window + 1));
  const returnsA: number[] = [];
  const returnsB: number[] = [];
  for (let index = 1; index < days.length; index += 1) {
    const previous = days[index - 1] ?? "";
    const current = days[index] ?? "";
    returnsA.push((a.get(current) ?? 0) / (a.get(previous) ?? 1) - 1);
    returnsB.push((b.get(current) ?? 0) / (b.get(previous) ?? 1) - 1);
  }
  return { returnsA, returnsB };
}

/**
 * Matrice de corrélation des rendements journaliers, calculée paire par paire sur les séances
 * communes. Une ligne sans assez d'historique commun avec aucune autre est retirée ; sous deux
 * lignes exploitables, il n'y a pas de matrice.
 */
export function correlationMatrix(series: readonly CloseSeries[], window = CORRELATION_WINDOW_DAYS): PortfolioCorrelation | undefined {
  const closes = series.map(closesByDay);
  const size = series.length;
  const matrix: (number | null)[][] = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (row === column ? 1 : null)));
  const usable = new Set<number>();
  let observations = Number.POSITIVE_INFINITY;
  for (let row = 0; row < size; row += 1) {
    for (let column = row + 1; column < size; column += 1) {
      const { returnsA, returnsB } = alignedReturns(closes[row] ?? new Map(), closes[column] ?? new Map(), window);
      if (returnsA.length < CORRELATION_MIN_OBSERVATIONS) continue;
      const value = pearson(returnsA, returnsB);
      (matrix[row] ?? [])[column] = value;
      (matrix[column] ?? [])[row] = value;
      if (value === null) continue;
      usable.add(row).add(column);
      observations = Math.min(observations, returnsA.length);
    }
  }
  if (usable.size < 2) return undefined;

  const kept = [...usable].sort((a, b) => a - b);
  const assets = kept.map((index) => ({ symbol: series[index]?.symbol ?? "", name: series[index]?.name ?? "" }));
  const keptMatrix = kept.map((row) => kept.map((column) => matrix[row]?.[column] ?? null));
  const highPairs: CorrelationPair[] = [];
  keptMatrix.forEach((values, row) => {
    for (let column = row + 1; column < values.length; column += 1) {
      const value = values[column];
      if (value !== null && value !== undefined && value > HIGH_CORRELATION_THRESHOLD) {
        highPairs.push({ a: assets[row]?.symbol ?? "", b: assets[column]?.symbol ?? "", value });
      }
    }
  });
  return { assets, matrix: keptMatrix, observations, highPairs: highPairs.sort((a, b) => b.value - a.value) };
}
