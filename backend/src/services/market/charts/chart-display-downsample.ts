import type { AssetChartDto, RangeKey } from "@pea/shared";

/**
 * Nombre maximal de points envoyés au navigateur pour les longues périodes d'un actif.
 * Au-delà, un graphique de quelques centaines de pixels ne gagne aucun détail visible alors
 * que la charge réseau et le tracé croissent (6 900 points ≈ 200 Ko pour l'historique complet).
 */
export const maxDisplayPointsByRange: Partial<Record<RangeKey, number>> = { "5y": 1000, "10y": 1000, all: 1000 };

/**
 * Sélectionne `threshold` indices avec l'algorithme « Largest Triangle Three Buckets » :
 * premier et dernier points conservés, puis dans chaque tranche le point qui forme le plus grand
 * triangle avec ses voisins. Contrairement à un pas régulier, les pics et creux restent visibles.
 */
export function largestTriangleThreeBucketsIndexes(times: number[], values: number[], threshold: number): number[] {
  const length = Math.min(times.length, values.length);
  if (threshold >= length || threshold < 3) return Array.from({ length }, (_value, index) => index);

  const indexes = [0];
  const bucketSize = (length - 2) / (threshold - 2);
  let selected = 0;
  for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
    const nextStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, length);
    let averageTime = 0;
    let averageValue = 0;
    for (let index = nextStart; index < nextEnd; index += 1) {
      averageTime += times[index] ?? 0;
      averageValue += values[index] ?? 0;
    }
    const nextCount = Math.max(nextEnd - nextStart, 1);
    averageTime /= nextCount;
    averageValue /= nextCount;

    const start = Math.floor(bucket * bucketSize) + 1;
    const end = Math.floor((bucket + 1) * bucketSize) + 1;
    const selectedTime = times[selected] ?? 0;
    const selectedValue = values[selected] ?? 0;
    let bestArea = -1;
    let best = start;
    for (let index = start; index < end; index += 1) {
      const area = Math.abs(
        (selectedTime - averageTime) * ((values[index] ?? 0) - selectedValue) -
        (selectedTime - (times[index] ?? 0)) * (averageValue - selectedValue)
      );
      if (area > bestArea) {
        bestArea = area;
        best = index;
      }
    }
    indexes.push(best);
    selected = best;
  }
  indexes.push(length - 1);
  return indexes;
}

/**
 * Réduit un graphique d'actif destiné à l'affichage. Les indicateurs (performance, baseline)
 * sont conservés tels que calculés sur la série complète. Ne pas utiliser pour des calculs.
 */
export function downsampleChartForDisplay(chart: AssetChartDto, range: RangeKey): AssetChartDto {
  const maxPoints = maxDisplayPointsByRange[range];
  if (maxPoints === undefined || chart.timestamps.length <= maxPoints) return chart;
  const indexes = largestTriangleThreeBucketsIndexes(chart.timestamps, chart.prices, maxPoints);
  const pick = (values: number[]) => indexes.map((index) => values[index]).filter((value): value is number => value !== undefined);
  return {
    ...chart,
    timestamps: pick(chart.timestamps),
    prices: pick(chart.prices),
    performance: chart.performance?.length === chart.timestamps.length ? pick(chart.performance) : chart.performance
  };
}
