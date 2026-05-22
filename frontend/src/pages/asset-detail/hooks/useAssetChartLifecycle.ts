import type { AssetChartDto, AssetDetails, RangeKey } from "@pea/shared";
import { useEffect, useRef, useState } from "react";
import { useMarketEventReload, type MarketEventPayload } from "../../../hooks/useMarketEventReload";
import { api } from "../../../lib/api";
import { isDataConstructionActive, notifyDataConstructionChanged } from "../../../lib/dataConstruction";

const lazyChartRetryCooldownMs = 60_000;
const lazyChartRefreshTimeoutMs = 45_000;

export function useAssetChartLifecycle({
  asset,
  loading,
  range,
  reload,
  symbol
}: {
  asset?: AssetDetails | null;
  loading: boolean;
  range: RangeKey;
  reload: () => Promise<void>;
  symbol: string;
}) {
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const [lastRenderableChart, setLastRenderableChart] = useState<AssetChartDto | undefined>(undefined);
  const lazyChartGuard = useRef({
    key: "",
    requestedForCacheVersion: "",
    lastRefreshRequestedAt: 0,
    refreshInProgress: false,
    suppressUntil: 0,
    timeout: undefined as number | undefined
  });

  const assetChartPreparing = Boolean(asset?.chart?.isPreparing);
  const chartPendingOpenConfirmation = asset?.chart?.availabilityStatus === "pending_open_confirmation";
  const currentChartPoints = chartDtoToPoints(asset?.chart);
  const displayChart = currentChartPoints.length > 1 ? asset?.chart : lastRenderableChart;
  const chartPoints = chartDtoToPoints(displayChart);

  useEffect(() => {
    setLastRenderableChart(undefined);
  }, [symbol, range]);

  useEffect(() => {
    if (asset?.quote.symbol.toUpperCase() === symbol.toUpperCase() && asset.chart && chartDtoToPoints(asset.chart).length > 1) {
      setLastRenderableChart(asset.chart);
    }
  }, [asset?.chart, asset?.quote.symbol, symbol]);

  useEffect(() => {
    if (!assetChartPreparing) return undefined;
    notifyDataConstructionChanged();

    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      const status = await api.dataConstructionStatus().catch(() => null);
      if (cancelled) return;
      if (!isDataConstructionActive(status)) {
        await reload();
        return;
      }
      timer = window.setTimeout(poll, 2000);
    }

    timer = window.setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [assetChartPreparing, reload]);

  useEffect(() => {
    if (range !== "1d" || !asset?.chart) return;
    const key = `${symbol.toUpperCase()}:1d`;
    const cacheVersion = chartCacheVersion(asset.chart);
    const guard = lazyChartGuard.current;
    const now = Date.now();

    if (guard.key !== key) {
      if (guard.timeout) window.clearTimeout(guard.timeout);
      lazyChartGuard.current = {
        key,
        requestedForCacheVersion: "",
        lastRefreshRequestedAt: 0,
        refreshInProgress: false,
        suppressUntil: 0,
        timeout: undefined
      };
    }

    const current = lazyChartGuard.current;
    if (current.refreshInProgress || now < current.suppressUntil) return;
    if (current.requestedForCacheVersion === cacheVersion && now - current.lastRefreshRequestedAt < lazyChartRetryCooldownMs) return;

    current.requestedForCacheVersion = cacheVersion;
    current.lastRefreshRequestedAt = now;

    const waitForRefreshCompletion = () => {
      current.refreshInProgress = true;
      setChartRefreshing(true);
      if (current.timeout) window.clearTimeout(current.timeout);
      current.timeout = window.setTimeout(() => {
        current.refreshInProgress = false;
        current.timeout = undefined;
        current.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        setChartRefreshing(false);
        void reload();
      }, lazyChartRefreshTimeoutMs);
    };

    api.requestChartRefresh({ scope: "asset", symbol, range: "1d" })
      .then((result) => {
        if (result.status === "started" || result.status === "in-progress") {
          waitForRefreshCompletion();
          return;
        }

        current.refreshInProgress = false;
        current.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (current.timeout) window.clearTimeout(current.timeout);
        current.timeout = undefined;
        setChartRefreshing(false);
      })
      .catch(() => {
        current.refreshInProgress = false;
        current.lastRefreshRequestedAt = Date.now();
        setChartRefreshing(false);
      });
  }, [asset?.chart, range, reload, symbol]);

  useMarketEventReload({
    debounceMs: 0,
    eventTypes: ["asset-chart-updated"],
    filterEvent: (payload) => payload.symbol?.toUpperCase() === symbol.toUpperCase() && payload.range === "1d",
    onEvent: (payload: MarketEventPayload) => {
      if (payload.symbol?.toUpperCase() !== symbol.toUpperCase() || payload.range !== "1d") return;
      if (payload.type === "asset-chart-refresh-started") setChartRefreshing(true);
      if (payload.type === "asset-chart-updated") {
        const guard = lazyChartGuard.current;
        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setChartRefreshing(false);
      }
    },
    reload,
    reloadOnFocus: false,
    reloadOnVisibility: false
  });

  useEffect(() => {
    return () => {
      const timeout = lazyChartGuard.current.timeout;
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  return {
    assetChartPreparing,
    chartPendingOpenConfirmation,
    chartPoints,
    chartRefreshing,
    displayChart,
    loading
  };
}

function chartDtoToPoints(chart?: AssetChartDto) {
  if (!chart) return [];
  return chart.timestamps.map((timestamp, index) => ({
    date: new Date(timestamp).toISOString(),
    value: chart.prices[index] ?? null
  }));
}

function chartCacheVersion(chart: AssetChartDto) {
  const lastTimestamp = chart.timestamps[chart.timestamps.length - 1] ?? "none";
  return `${chart.timestamps.length}:${lastTimestamp}:${chart.baselineDatetime ?? ""}`;
}
