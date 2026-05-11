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

const refreshCooldownMs = 60_000;

export function useAssetComparisonSeries(targets: ComparableAsset[], range: RangeKey) {
  const [series, setSeries] = useState<AssetComparisonSerie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparingSymbols, setPreparingSymbols] = useState<string[]>([]);
  const loadId = useRef(0);
  const refreshAttempts = useRef(new Map<string, number>());
  const targetsRef = useRef<ComparableAsset[]>(targets);
  const rangeRef = useRef<RangeKey>(range);

  useEffect(() => {
    targetsRef.current = targets;
    rangeRef.current = range;
  }, [targets, range]);

  useEffect(() => {
    const currentLoadId = ++loadId.current;
    let cancelled = false;

    if (targets.length === 0) {
      setSeries([]);
      setLoading(false);
      setError(null);
      setPreparingSymbols([]);
      return;
    }

    setSeries([]);
    setLoading(true);
    setError(null);
    setPreparingSymbols([]);

    async function loadSeries() {
      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const chart = await api.history(target.symbol, range);
          return { target, chart, serie: chartDtoToComparisonSerie(target, chart) };
        })
      );

      if (cancelled || loadId.current !== currentLoadId) return;

      const loadedSeries = results
        .filter((result): result is PromiseFulfilledResult<{ target: ComparableAsset; chart: AssetChartDto; serie: AssetComparisonSerie | null }> => result.status === "fulfilled")
        .map((result) => result.value);
      const displaySeries = loadedSeries.map((item) => item.serie).filter((item): item is AssetComparisonSerie => item != null);

      if (displaySeries.length === targets.length) {
        setSeries(displaySeries);
        setLoading(false);
        return;
      }

      const missingTargets = targets.filter((target) => {
        const loaded = loadedSeries.find((item) => item.target.symbol === target.symbol);
        return !loaded?.serie;
      });
      const launched = await requestInitialRefreshes(missingTargets, range, refreshAttempts.current);
      if (cancelled || loadId.current !== currentLoadId) return;

      setSeries(displaySeries);
      setPreparingSymbols(launched);
      setError(launched.length > 0 ? null : "Comparaison indisponible pour au moins un actif");
      setLoading(false);
    }

    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [targets, range]);

  useEffect(() => {
    function onMarketEvent(event: Event) {
      const payload = (event as CustomEvent<{ type?: string; symbol?: string; range?: string }>).detail;
      if (payload?.type !== "asset-chart-updated" || payload.range !== rangeRef.current || !payload.symbol) return;
      const key = payload.symbol.toUpperCase();
      if (!targetsRef.current.some((target) => target.symbol.toUpperCase() === key)) return;
      loadId.current += 1;
      const currentLoadId = loadId.current;
      setLoading(true);
      void reloadTargets(targetsRef.current, rangeRef.current).then((loadedSeries) => {
        if (loadId.current !== currentLoadId) return;
        setSeries(loadedSeries);
        setPreparingSymbols([]);
        setError(loadedSeries.length === targetsRef.current.length ? null : "Comparaison indisponible pour au moins un actif");
        setLoading(false);
      });
    }
    window.addEventListener("pea:market-event", onMarketEvent);
    return () => window.removeEventListener("pea:market-event", onMarketEvent);
  }, []);

  return { series, loading, error, preparingSymbols };
}

async function reloadTargets(targets: ComparableAsset[], range: RangeKey) {
  const results = await Promise.allSettled(
    targets.map(async (target) => chartDtoToComparisonSerie(target, await api.history(target.symbol, range)))
  );
  return results
    .filter((result): result is PromiseFulfilledResult<AssetComparisonSerie | null> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((item): item is AssetComparisonSerie => item != null);
}

async function requestInitialRefreshes(targets: ComparableAsset[], range: RangeKey, attempts: Map<string, number>) {
  if (range !== "1d" || targets.length === 0) return [];
  const now = Date.now();
  const launched: string[] = [];
  await Promise.allSettled(targets.map(async (target) => {
    const key = `${target.symbol.toUpperCase()}:${range}`;
    const lastAttempt = attempts.get(key) ?? 0;
    if (now - lastAttempt < refreshCooldownMs) return;
    attempts.set(key, now);
    const result = await api.requestChartRefresh({ scope: "asset", symbol: target.symbol, range: "1d" });
    if (result.status === "started" || result.status === "in-progress") launched.push(target.symbol);
  }));
  return launched;
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
