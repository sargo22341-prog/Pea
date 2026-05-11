import type { AssetChartDto, RangeKey } from "@pea/shared";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ComparisonSerie } from "../components/charts/PriceHistoryChart";
import type { PriceHistoryInputPoint } from "./usePriceHistoryChart";

export interface ComparableAsset {
  symbol: string;
  name: string;
}

export interface AssetComparisonSerie extends ComparisonSerie {
  timestamps: number[];
  prices: number[];
}

export function useAssetComparisonSeries(targets: ComparableAsset[], range: RangeKey) {
  const [series, setSeries] = useState<AssetComparisonSerie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);

  useEffect(() => {
    const currentLoadId = ++loadId.current;

    if (targets.length === 0) {
      setSeries([]);
      setLoading(false);
      setError(null);
      return;
    }

    setSeries([]);
    setLoading(true);
    setError(null);

    async function loadSeries() {
      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const chart = await api.history(target.symbol, range);
          return chartDtoToComparisonSerie(target, chart);
        })
      );

      if (loadId.current !== currentLoadId) return;

      const loadedSeries = results
        .filter((result): result is PromiseFulfilledResult<AssetComparisonSerie | null> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((item): item is AssetComparisonSerie => item != null);

      if (loadedSeries.length === targets.length) {
        setSeries(loadedSeries);
        setLoading(false);
        return;
      }

      setSeries(loadedSeries);
      setError("Comparaison indisponible pour au moins un actif");
      setLoading(false);
    }

    void loadSeries();
  }, [targets, range]);

  return { series, loading, error };
}

function chartDtoToComparisonSerie(target: ComparableAsset, chart: AssetChartDto): AssetComparisonSerie | null {
  if (chart.isPreparing) return null;

  const points = chartDtoToPoints(chart);
  if (points.length < 2) return null;

  return {
    symbol: target.symbol,
    name: target.name,
    points,
    timestamps: chart.timestamps,
    prices: chart.prices
  };
}

function chartDtoToPoints(chart: AssetChartDto): PriceHistoryInputPoint[] {
  return chart.timestamps.map((timestamp, index) => ({
    date: new Date(timestamp).toISOString(),
    value: chart.prices[index] ?? null
  }));
}
