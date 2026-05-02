/**
 * Rôle du fichier : définir la liste des benchmarks disponibles et leur mapping
 * vers les tickers Yahoo Finance utilisés pour récupérer l'historique.
 */

export type BenchmarkKey = "msci-world" | "sp500" | "cac40";

export interface BenchmarkConfig {
  key: BenchmarkKey;
  /** Nom affiché dans le menu et la légende du graphique. */
  label: string;
  /** Ticker Yahoo Finance utilisé pour l'appel à l'API. */
  ticker: string;
}

/** Couleur jaune dorée utilisée pour tout ce qui concerne le benchmark actif. */
export const BENCHMARK_COLOR = "#f59e0b";

export const BENCHMARKS: BenchmarkConfig[] = [
  { key: "msci-world", label: "MSCI World", ticker: "URTH" },
  { key: "sp500", label: "S&P 500", ticker: "^GSPC" },
  { key: "cac40", label: "CAC 40", ticker: "^FCHI" }
];

/** Récupère la configuration d'un benchmark par sa clé. */
export function getBenchmarkConfig(key: BenchmarkKey): BenchmarkConfig {
  const config = BENCHMARKS.find((b) => b.key === key);
  if (!config) throw new Error(`Benchmark inconnu : ${key}`);
  return config;
}
