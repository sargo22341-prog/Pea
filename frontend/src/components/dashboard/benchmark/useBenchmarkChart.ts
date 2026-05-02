/**
 * Rôle du fichier : hook React qui gère le fetch et le cache des données benchmark.
 * Expose les timestamps et prix bruts ; la normalisation en base 100 se fait
 * dans PortfolioComparisonChart qui a accès aux deux séries simultanément.
 */

import type { RangeKey } from "@pea/shared";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getCachedBenchmark, setCachedBenchmark } from "./benchmark.cache";
import { getBenchmarkConfig, type BenchmarkKey } from "./benchmarks.config";

export interface BenchmarkData {
  key: BenchmarkKey;
  label: string;
  timestamps: number[];
  prices: number[];
}

export interface BenchmarkResult {
  data: BenchmarkData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Récupère l'historique d'un benchmark pour une range donnée.
 * Consulte le cache mémoire avant d'appeler l'API /history/:symbol.
 * Annule la requête en vol si le composant se démonte ou si la dépendance change.
 */
export function useBenchmarkChart(benchmarkKey: BenchmarkKey | null, range: RangeKey): BenchmarkResult {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!benchmarkKey) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const config = getBenchmarkConfig(benchmarkKey);
    let cancelled = false;

    async function fetchBenchmark() {
      setLoading(true);
      setError(null);

      // Vérification du cache avant tout appel réseau
      const cached = getCachedBenchmark(config.ticker, range);
      if (cached) {
        if (!cancelled) {
          setData({ key: benchmarkKey!, label: config.label, timestamps: cached.timestamps, prices: cached.prices });
          setLoading(false);
        }
        return;
      }

      try {
        const result = await api.history(config.ticker, range);
        if (result.timestamps.length === 0) {
          // Le backend est en cours de rebuild — on ne met pas en cache pour réessayer au prochain appel.
          if (!cancelled) setError("Données benchmark indisponibles (reconstruction en cours)");
          return;
        }
        setCachedBenchmark(config.ticker, range, result);
        if (!cancelled) {
          setData({ key: benchmarkKey!, label: config.label, timestamps: result.timestamps, prices: result.prices });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur lors du chargement du benchmark");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchBenchmark();
    return () => {
      cancelled = true;
    };
  }, [benchmarkKey, range]);

  return { data, loading, error };
}
