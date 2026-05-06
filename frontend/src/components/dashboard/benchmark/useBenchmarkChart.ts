/**
 * Role du fichier : hook React qui gere le fetch et le cache des donnees benchmark.
 * Expose les timestamps et prix bruts ; la normalisation en base 100 se fait
 * dans PortfolioComparisonChart qui a acces aux deux series simultanement.
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
 * Recupere l'historique d'un benchmark pour une range donnee.
 * Consulte le cache memoire avant d'appeler l'API /history/:symbol.
 * Annule la requete en vol si le composant se demonte ou si la dependance change.
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
    let retryTimer: number | undefined;

    function retryLater() {
      if (cancelled) return;
      retryTimer = window.setTimeout(fetchBenchmark, 2000);
    }

    async function fetchBenchmark() {
      let retryScheduled = false;
      setLoading(true);
      setError(null);

      const cached = getCachedBenchmark(config.ticker, range);
      if (cached) {
        if (!cancelled) {
          setData({ key: benchmarkKey!, label: config.label, timestamps: cached.timestamps, prices: cached.prices });
          setLoading(false);
        }
        return;
      }

      setData(null);

      try {
        const result = await api.history(config.ticker, range);
        if (result.timestamps.length === 0) {
          if (!cancelled) {
            setData(null);
            retryScheduled = true;
            retryLater();
          }
          return;
        }
        setCachedBenchmark(config.ticker, range, result);
        if (!cancelled) {
          setData({ key: benchmarkKey!, label: config.label, timestamps: result.timestamps, prices: result.prices });
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          retryScheduled = true;
          retryLater();
        }
      } finally {
        if (!cancelled && !retryScheduled) setLoading(false);
      }
    }

    void fetchBenchmark();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [benchmarkKey, range]);

  return { data, loading, error };
}
