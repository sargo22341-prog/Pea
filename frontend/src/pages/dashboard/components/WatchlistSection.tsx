import type { MarketEventType, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { StaleBadge } from "../../../components/common/StaleBadge";
import { useAsync } from "../../../hooks/useAsync";
import { useMarketEventReload, type MarketEventPayload } from "../../../hooks/useMarketEventReload";
import { api } from "../../../lib/api";
import { money, percent } from "../../../lib/format";
import { SortableSection, type SortOption } from "./SortableSection";
import { sortWatchlistItems, watchlistCacheVersion } from "./dashboardSort.helpers";

const lazyChartRetryCooldownMs = 60_000;
const lazyChartRefreshTimeoutMs = 45_000;

const watchlistSortOptions: Array<Omit<SortOption<WatchlistSortKey>, "label"> & { labelKey: string }> = [
  { labelKey: "sort.nameAsc", key: "name", direction: "asc" },
  { labelKey: "sort.nameDesc", key: "name", direction: "desc" },
  { labelKey: "sort.priceAsc", key: "price", direction: "asc" },
  { labelKey: "sort.priceDesc", key: "price", direction: "desc" },
  { labelKey: "sort.performanceAsc", key: "performancePercent", direction: "asc" },
  { labelKey: "sort.performanceDesc", key: "performancePercent", direction: "desc" }
];

const watchlistReloadEvents: MarketEventType[] = [
  "market-snapshot-updated",
  "watchlist-market-updated",
  "watchlist-assets-updated",
  "watchlist-chart-updated"
];

export function WatchlistSection({ range = "1d", defaultSortKey = "name", defaultSortDirection = "asc" }: { range?: RangeKey; defaultSortKey?: WatchlistSortKey; defaultSortDirection?: SortDirection }) {
  const { t } = useTranslation(["dashboard", "settings"]);
  const navigate = useNavigate();
  const watchlist = useAsync((signal) => api.watchlist(range, signal), range);
  const [sortKey, setSortKey] = useState<WatchlistSortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const lazyChartGuard = useRef({
    requestedForCacheVersion: "",
    lastRefreshRequestedAt: 0,
    refreshInProgress: false,
    suppressUntil: 0,
    timeout: undefined as number | undefined
  });
  const watchlistReload = watchlist.reload;

  useMarketEventReload({
    debounceMs: 400,
    eventTypes: watchlistReloadEvents,
    onEvent: (payload: MarketEventPayload) => {
      if (payload.type === "watchlist-chart-refresh-started") {
        lazyChartGuard.current.refreshInProgress = true;
        setChartRefreshing(true);
      }
      if (payload.type === "watchlist-chart-updated") {
        const guard = lazyChartGuard.current;
        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setChartRefreshing(false);
      }
    },
    reload: watchlistReload
  });

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
    return sortWatchlistItems(watchlist.data ?? [], sortKey, sortDirection);
  }, [sortDirection, sortKey, watchlist.data]);
  const translatedSortOptions = useMemo<Array<SortOption<WatchlistSortKey>>>(
    () => watchlistSortOptions.map((option) => ({ ...option, label: t(option.labelKey, { ns: "settings" }) })),
    [t]
  );

  if (watchlist.loading) {
    return <div className="card p-4 text-slate-400">{t("watchlistSection.loading", { ns: "dashboard" })}</div>;
  }

  if (!watchlist.data || watchlist.data.length === 0) {
    return null;
  }

  async function remove(symbol: string) {
    await api.removeWatchlist(symbol);
    await watchlist.reload();
  }

  function updateSort(key: WatchlistSortKey, direction: SortDirection) {
    setSortKey(key);
    setSortDirection(direction);
  }

  return (
    <SortableSection
      activeDirection={sortDirection}
      activeKey={sortKey}
      as="section"
      className={`card overflow-hidden ${chartRefreshing ? "stale-refreshing" : ""}`}
      onSortChange={updateSort}
      options={translatedSortOptions}
      title={<h2 className="truncate font-semibold">{t("watchlist", { ns: "dashboard" })}</h2>}
      titleClassName="min-w-0"
    >
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
                  {t("watchlistSection.currentPrice", { ns: "dashboard" })}
                </p>
                <p className="truncate whitespace-nowrap text-xs font-semibold tabular-nums sm:text-base">
                  {item.quote ? money(item.quote.price, item.quote.currency) : "n/a"}
                </p>
              </div>

              <div className="min-w-0 justify-self-end text-right leading-tight">
                <p className="hidden text-sm text-slate-400 sm:block">{t("watchlistSection.valuePerformance", { ns: "dashboard" })}</p>

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
                title={t("watchlistSection.remove", { ns: "dashboard" })}
                type="button"
              >
                <Star fill="currentColor" size={20} />
              </button>
            </div>
          );
        })}
      </div>
    </SortableSection>
  );
}
