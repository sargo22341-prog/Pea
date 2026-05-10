/**
 * Role du fichier : afficher la liste de suivi du Dashboard avec tri local et
 * performances calculees sur la range active.
 */

import type { RangeKey, SortDirection, WatchlistItem, WatchlistSortKey } from "@pea/shared";
import { ArrowDownNarrowWide, ArrowDownRight, ArrowUpNarrowWide, ArrowUpRight, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { money, percent } from "../../lib/format";
import { AssetIcon } from "../common/AssetIcon";
import { StaleBadge } from "../common/StaleBadge";

const lazyChartRetryCooldownMs = 60_000;
const lazyChartRefreshTimeoutMs = 45_000;

const watchlistSortOptions: Array<{ label: string; key: WatchlistSortKey; direction: SortDirection }> = [
  { label: "Nom A -> Z", key: "name", direction: "asc" },
  { label: "Nom Z -> A", key: "name", direction: "desc" },
  { label: "Prix croissant", key: "price", direction: "asc" },
  { label: "Prix decroissant", key: "price", direction: "desc" },
  { label: "Performance croissante", key: "performancePercent", direction: "asc" },
  { label: "Performance decroissante", key: "performancePercent", direction: "desc" }
];

export function WatchlistSection({ range = "1d", defaultSortKey = "name", defaultSortDirection = "asc" }: { range?: RangeKey; defaultSortKey?: WatchlistSortKey; defaultSortDirection?: SortDirection }) {
  const navigate = useNavigate();
  const watchlist = useAsync((signal) => api.watchlist(range, signal), [range]);
  const [sortKey, setSortKey] = useState<WatchlistSortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [sortOpen, setSortOpen] = useState(false);
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAutoReloadAt = useRef(0);
  const lazyChartGuard = useRef({
    requestedForCacheVersion: "",
    lastRefreshRequestedAt: 0,
    refreshInProgress: false,
    suppressUntil: 0,
    timeout: undefined as number | undefined
  });
  const watchlistReload = watchlist.reload;

  useEffect(() => {
    if (!sortOpen) return undefined;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [sortOpen]);

  useEffect(() => {
    function reloadVisibleWatchlist() {
      const now = Date.now();
      if (now - lastAutoReloadAt.current < 1500) return;
      lastAutoReloadAt.current = now;
      void watchlistReload();
    }

    function onMarketEvent(event: Event) {
      const payload = (event as CustomEvent<{ type?: string }>).detail;
      if (payload?.type === "watchlist-chart-refresh-started") {
        lazyChartGuard.current.refreshInProgress = true;
        setChartRefreshing(true);
      }
      if (payload?.type === "watchlist-chart-updated") {
        const guard = lazyChartGuard.current;
        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setChartRefreshing(false);
      }
      if (payload?.type === "market-snapshot-updated" || payload?.type === "watchlist-market-updated" || payload?.type === "watchlist-assets-updated" || payload?.type === "watchlist-chart-updated") {
        window.setTimeout(reloadVisibleWatchlist, 400);
      }
    }

    function onForeground() {
      if (document.visibilityState === "visible") reloadVisibleWatchlist();
    }

    window.addEventListener("pea:market-event", onMarketEvent);
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      window.removeEventListener("pea:market-event", onMarketEvent);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [watchlistReload]);

  useEffect(() => {
    if (!watchlist.data?.length || range !== "1d") return;
    const cacheVersion = watchlistCacheVersion(watchlist.data);
    const guard = lazyChartGuard.current;
    const now = Date.now();
    if (guard.refreshInProgress || now < guard.suppressUntil) return;
    if (guard.requestedForCacheVersion === cacheVersion && now - guard.lastRefreshRequestedAt < lazyChartRetryCooldownMs) return;

    guard.requestedForCacheVersion = cacheVersion;
    guard.lastRefreshRequestedAt = now;

    api.requestChartRefresh({ scope: "watchlist", range: "1d" })
      .then((result) => {
        if (result.status === "started" || result.status === "in-progress") {
          guard.refreshInProgress = true;
          setChartRefreshing(true);
          if (guard.timeout) window.clearTimeout(guard.timeout);
          guard.timeout = window.setTimeout(() => {
            guard.refreshInProgress = false;
            guard.timeout = undefined;
            setChartRefreshing(false);
          }, lazyChartRefreshTimeoutMs);
          return;
        }

        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setChartRefreshing(false);
      })
      .catch(() => {
        guard.refreshInProgress = false;
        guard.lastRefreshRequestedAt = Date.now();
        setChartRefreshing(false);
      });
  }, [range, watchlist.data]);

  useEffect(() => {
    const guard = lazyChartGuard.current;
    return () => {
      const timeout = guard.timeout;
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  const sortedItems = useMemo(() => {
    return (watchlist.data ?? [])
      .map((item) => ({ item, metrics: watchlistMetrics(item) }))
      .sort((a, b) => {
        const direction = sortDirection === "asc" ? 1 : -1;

        if (sortKey === "name") {
          return a.item.name.localeCompare(b.item.name, "fr") * direction;
        }

        return (metricValue(a.metrics[sortKey]) - metricValue(b.metrics[sortKey])) * direction;
      });
  }, [sortDirection, sortKey, watchlist.data]);

  if (watchlist.loading) {
    return <div className="card p-4 text-slate-400">Chargement de la liste de suivi...</div>;
  }

  if (!watchlist.data || watchlist.data.length === 0) {
    return null;
  }

  async function remove(symbol: string) {
    await api.removeWatchlist(symbol);
    await watchlist.reload();
  }

  function updateSort(value: string) {
    const [key, direction] = value.split(":") as [WatchlistSortKey, SortDirection];
    setSortKey(key);
    setSortDirection(direction);
    setSortOpen(false);
  }

  const activeSort =
    watchlistSortOptions.find((option) => option.key === sortKey && option.direction === sortDirection) ??
    watchlistSortOptions[0];

  const SortIcon = sortDirection === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;

  return (
    <section className={`card overflow-hidden ${chartRefreshing ? "stale-refreshing" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">Liste de suivi</h2>
          <p className="mt-1 truncate text-xs text-slate-400">Tri actif: {activeSort.label}</p>
        </div>

        <div className="relative shrink-0" ref={sortMenuRef}>
          <button
            aria-expanded={sortOpen}
            aria-haspopup="menu"
            className="btn-ghost px-2.5 sm:px-3"
            onClick={() => setSortOpen((current) => !current)}
            title={sortDirection === "asc" ? "Trier vers le haut" : "Trier vers le bas"}
            type="button"
          >
            <SortIcon size={17} />
            <span className="hidden sm:inline">Trier</span>
          </button>

          {sortOpen && (
            <div
              className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-md border border-line bg-panel shadow-glow"
              role="menu"
            >
              {watchlistSortOptions.map((option) => {
                const active = option.key === sortKey && option.direction === sortDirection;

                return (
                  <button
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-panel2 ${active ? "bg-sky/15 text-sky" : "text-slate-100"}`}
                    key={`${option.key}:${option.direction}`}
                    onClick={() => updateSort(`${option.key}:${option.direction}`)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{option.label}</span>
                    {active && <span className="text-xs font-semibold">actif</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="divide-y divide-line">
        {sortedItems.map(({ item, metrics }) => {
          const { performanceValue, performancePercent } = metrics;
          const positive = (performanceValue ?? 0) >= 0;
          const Icon = positive ? ArrowUpRight : ArrowDownRight;

          return (
            <div
              className="grid min-w-0 cursor-pointer grid-cols-[1fr_96px_1fr_24px] items-center gap-2 p-3 transition-colors hover:bg-white/[0.03] sm:grid-cols-[1fr_140px_1fr_24px] sm:gap-3 sm:p-4"
              key={item.symbol}
              onClick={() => navigate(`/assets/${item.symbol}`)}
              role="row"
            >
              <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                <AssetIcon symbol={item.symbol} />

                <div className="min-w-0 w-full overflow-hidden leading-tight">
                  <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
                    <p className="min-w-0 truncate text-sm font-semibold sm:text-base">{item.name}</p>

                    <span className="hidden shrink-0 sm:inline">
                      <StaleBadge show={item.marketDataUnavailable || item.quote?.stale} />
                    </span>
                  </div>

                  <p className="truncate text-[11px] text-slate-400 sm:text-sm">{item.symbol}</p>
                </div>
              </div>

              <div className="min-w-0 justify-self-center text-center leading-tight">
                <p className="text-[10px] font-semibold text-slate-400 sm:text-xs">
                  Prix actuel
                </p>
                <p className="truncate whitespace-nowrap text-xs font-semibold tabular-nums sm:text-base">
                  {item.quote ? money(item.quote.price, item.quote.currency) : "n/a"}
                </p>
              </div>

              <div className="min-w-0 justify-self-end text-right leading-tight">
                <p className="hidden text-sm text-slate-400 sm:block">Valeur | Perf</p>

                <p
                  className={`flex min-w-0 items-center justify-end gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums sm:text-sm ${positive ? "text-mint" : "text-coral"}`}
                >
                  <Icon size={12} className="shrink-0 sm:hidden" />
                  <Icon size={16} className="hidden shrink-0 sm:block" />

                  <span className="min-w-0 truncate">
                    {performanceValue === undefined || !item.quote
                      ? "n/a"
                      : money(performanceValue, item.quote.currency)}{" "}
                    | {performancePercent === undefined ? "n/a" : percent(performancePercent)}
                  </span>
                </p>
              </div>

              <button
                className="justify-self-end text-amber"
                onClick={(e) => { e.stopPropagation(); void remove(item.symbol); }}
                title="Retirer de la liste de suivi"
                type="button"
              >
                <Star fill="currentColor" size={20} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Calcule les valeurs de tri et de performance a partir de l'historique charge.
 */
function watchlistMetrics(item: WatchlistItem) {
  const first = item.history[0]?.close;
  const last = item.history[item.history.length - 1]?.close ?? item.quote?.price;

  const performanceValue =
    Number.isFinite(first) && Number.isFinite(last)
      ? Number(last) - Number(first)
      : item.quote?.change;

  const performancePercent =
    Number.isFinite(first) && first
      ? ((Number(last) - Number(first)) / Number(first)) * 100
      : item.quote?.changePercent;

  return {
    price: item.quote?.price,
    performanceValue,
    performancePercent
  };
}

function metricValue(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : Number.NEGATIVE_INFINITY;
}

function watchlistCacheVersion(items: WatchlistItem[]) {
  return items
    .map((item) => {
      const lastPoint = item.history[item.history.length - 1];
      return `${item.symbol}:${item.history.length}:${lastPoint?.date ?? "none"}`;
    })
    .sort()
    .join("|");
}
