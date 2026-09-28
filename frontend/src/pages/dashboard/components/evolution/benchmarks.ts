import type { ComparableAsset } from "../../../../hooks/useAssetComparisonSeries";

/**
 * Indices proposés pour situer la performance du portefeuille (courbe base 100 en pointillé) :
 * marché français, zone euro et monde (ETF MSCI World éligible PEA).
 */
export const DEFAULT_BENCHMARKS: readonly ComparableAsset[] = [
  { symbol: "^FCHI", name: "CAC 40" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50" },
  { symbol: "CW8.PA", name: "MSCI World (CW8)" }
];

const BENCHMARK_SYMBOLS = new Set(DEFAULT_BENCHMARKS.map((benchmark) => benchmark.symbol));

export function isBenchmark(symbol: string) {
  return BENCHMARK_SYMBOLS.has(symbol);
}
