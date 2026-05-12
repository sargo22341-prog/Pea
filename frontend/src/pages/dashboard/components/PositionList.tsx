/**
 * Role du fichier : afficher la liste des positions avec un chargement
 * paresseux ligne par ligne pour reduire le travail initial du Dashboard.
 */

import type { DashboardSortKey, PositionRangePerformance, PositionWithMarket, RangeKey, SortDirection } from "@pea/shared";
import { ArrowDownNarrowWide, ArrowDownRight, ArrowUpNarrowWide, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePrivacy } from "../../../contexts/PrivacyContext";
import { api } from "../../../lib/api";
import { formatRangeLabel, money, percent } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { localIsoDate, normalizeTimeZone, zonedTimeToUtc } from "../../../lib/timezone";
import { AssetIcon } from "../../../components/common/AssetIcon";

const sortOptions: Array<{ label: string; key: DashboardSortKey; direction: SortDirection }> = [
  { label: "Nom A -> Z", key: "name", direction: "asc" },
  { label: "Nom Z -> A", key: "name", direction: "desc" },
  { label: "Valeur marche croissante", key: "currentMarketValue", direction: "asc" },
  { label: "Valeur marche decroissante", key: "currentMarketValue", direction: "desc" },
  { label: "Variation % croissante", key: "intervalPerformancePercent", direction: "asc" },
  { label: "Variation % decroissante", key: "intervalPerformancePercent", direction: "desc" }
];

export function PositionList({
  positions,
  range,
  defaultSortKey = "name",
  defaultSortDirection = "asc"
}: {
  positions: PositionWithMarket[];
  range: RangeKey;
  defaultSortKey?: DashboardSortKey;
  defaultSortDirection?: SortDirection;
}) {
  const [sortKey, setSortKey] = useState<DashboardSortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const [sortOpen, setSortOpen] = useState(false);
  const [performanceById, setPerformanceById] = useState<Map<number, PositionRangePerformance>>(new Map());
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceRefreshing, setPerformanceRefreshing] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const lastAutoReloadAt = useRef(0);

  useEffect(() => {
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }, [defaultSortDirection, defaultSortKey]);

  useEffect(() => {
    if (!sortOpen) return undefined;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!sortMenuRef.current?.contains(event.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [sortOpen]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setPerformanceError(null);
    setPerformanceById(new Map());
    api.positionsPerformance(range, controller.signal)
      .then((items) => {
        if (!cancelled) setPerformanceById(new Map(items.map((item) => [item.id, item])));
      })
      .catch((caughtError) => {
        if (!cancelled) setPerformanceError(caughtError instanceof Error ? caughtError.message : "Performances indisponibles");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [range]);

  useEffect(() => {
    let debounceTimer: number | undefined;
    let refreshGuardTimer: number | undefined;

    function stopRefreshingSoon() {
      if (refreshGuardTimer) window.clearTimeout(refreshGuardTimer);
      refreshGuardTimer = window.setTimeout(() => setPerformanceRefreshing(false), 45_000);
    }

    function reloadPerformance() {
      const now = Date.now();
      if (now - lastAutoReloadAt.current < 1500) return;
      lastAutoReloadAt.current = now;
      api.positionsPerformance(range)
        .then((items) => {
          setPerformanceById(new Map(items.map((item) => [item.id, item])));
          setPerformanceRefreshing(false);
        })
        .catch((caughtError) => {
          setPerformanceError(caughtError instanceof Error ? caughtError.message : "Performances indisponibles");
          setPerformanceRefreshing(false);
        });
    }

    function scheduleReload() {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(reloadPerformance, 300);
    }

    function onMarketEvent(event: Event) {
      const payload = (event as CustomEvent<{ type?: string; range?: string }>).detail;
      if (payload.range && payload.range !== range) return;
      if (payload.type === "portfolio-performance-refresh-started" || payload.type === "portfolio-chart-refresh-started") {
        setPerformanceRefreshing(true);
        stopRefreshingSoon();
      }
      if (payload.type === "portfolio-performance-updated" || payload.type === "portfolio-chart-updated" || payload.type === "portfolio-assets-updated") scheduleReload();
    }

    window.addEventListener("pea:market-event", onMarketEvent);
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (refreshGuardTimer) window.clearTimeout(refreshGuardTimer);
      window.removeEventListener("pea:market-event", onMarketEvent);
    };
  }, [range]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * direction;
      const comparison = sortValue(a, sortKey, performanceById) - sortValue(b, sortKey, performanceById);
      return comparison === 0 ? a.name.localeCompare(b.name, "fr") : comparison * direction;
    });
  }, [performanceById, positions, sortDirection, sortKey]);

  /**
   * Met a jour l'option de tri choisie dans le menu.
   */
  function updateSort(value: string) {
    const [key, direction] = value.split(":") as [DashboardSortKey, SortDirection];
    setSortKey(key);
    setSortDirection(direction);
    setSortOpen(false);
  }

  const prive = usePrivacy();
  const rangeLabel = formatRangeLabel(range);
  const activeSort = sortOptions.find((option) => option.key === sortKey && option.direction === sortDirection) ?? sortOptions[0];
  const SortIcon = sortDirection === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;

  return (
    <div className={`card overflow-hidden ${performanceRefreshing ? "stale-refreshing" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="font-semibold"><span className="sm:hidden">Liste des positions</span><span className="hidden sm:inline">Positions</span></h2>
          <p className="mt-1 text-xs text-slate-400">Tri actif: {activeSort.label}</p>
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
            <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-md border border-line bg-panel shadow-glow" role="menu">
              {sortOptions.map((option) => {
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
        {sortedPositions.map((position) => (
          <LazyPositionRow
            key={`${position.id}:${range}`}
            loadedPosition={performanceById.get(position.id) ?? null}
            error={performanceError}
            position={position}
            prive={prive}
            rangeLabel={rangeLabel}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Retourne la valeur de tri stable disponible dans la synthese portefeuille.
 */
function sortValue(basePosition: PositionWithMarket, key: DashboardSortKey, performanceById: Map<number, PositionRangePerformance>) {
  const rangePerformance = performanceById.get(basePosition.id);
  if (key === "currentMarketValue") return rangePerformance?.currentMarketValue ?? basePosition.marketValue;
  return rangePerformance?.intervalPerformancePercent ?? basePosition.performancePercent;
}

/**
 * Charge une ligne de position quand elle approche du viewport.
 */
function LazyPositionRow({
  position,
  rangeLabel,
  loadedPosition,
  error,
  prive
}: {
  position: PositionWithMarket;
  rangeLabel: string;
  loadedPosition: PositionRangePerformance | null;
  error: string | null;
  prive: boolean;
}) {
  const [visibleSoon, setVisibleSoon] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rowRef.current;
    if (!target || visibleSoon) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleSoon(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleSoon]);

  if (!loadedPosition || !visibleSoon) {
    return (
      <div ref={rowRef}>
        <PositionRowSkeleton name={position.name} symbol={position.symbol} error={error} />
      </div>
    );
  }

  const positive = loadedPosition.intervalPerformanceValue >= 0;
  return (
    <div ref={rowRef}>
      <Link className="block min-h-[76px] min-w-0 p-3 transition hover:bg-panel2 sm:min-h-[88px] sm:p-4" to={`/assets/${loadedPosition.symbol}`}>
        <MobilePositionRow position={loadedPosition} positive={positive} prive={prive} />
        <DesktopPositionRow position={loadedPosition} positive={positive} prive={prive} rangeLabel={rangeLabel} />
      </Link>
    </div>
  );
}

/**
 * Affiche une ligne reservee pendant le chargement d'une position.
 */
function PositionRowSkeleton({ name, symbol, error }: { name: string; symbol: string; error: string | null }) {
  return (
    <div className="min-h-[76px] p-3 sm:min-h-[88px] sm:p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-md bg-panel2" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-200">{name}</p>
          <p className="muted">{symbol}</p>
        </div>
        <div className="hidden min-w-[120px] space-y-2 lg:block">
          <div className="ml-auto h-3 w-24 animate-pulse rounded bg-panel2" />
          <div className="ml-auto h-3 w-32 animate-pulse rounded bg-panel2" />
        </div>
        <div className="min-w-[92px] space-y-2">
          <div className="ml-auto h-3 w-20 animate-pulse rounded bg-panel2" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-panel2" />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-coral">{error}</p>}
    </div>
  );
}

function MobilePositionRow({ position, positive, prive }: { position: PositionRangePerformance; positive: boolean; prive: boolean }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_84px_minmax(82px,106px)] items-center gap-2 lg:hidden">
      <AssetIcon symbol={position.symbol} />
      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{position.name}</p>
        </div>
        <p className="truncate text-[11px] text-slate-400">
          {masquerValeur(`${formatQuantity(position.quantity)} x ${money(position.averageBuyPrice, position.currency)}`, prive)}
        </p>
      </div>
      <MiniSparkline miniChart={position.miniChart} tone={sparklineTone(position)} />
      <div className="min-w-0 text-right leading-tight">
        <p className="truncate whitespace-nowrap text-xs font-semibold tabular-nums">{masquerValeur(money(position.currentMarketValue, position.currency), prive)}</p>
        <p className={`mt-0.5 flex min-w-0 items-center justify-end gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={12} />
          <span className="min-w-0 truncate">
            {masquerValeur(`${money(position.intervalPerformanceValue, position.currency)} | ${percent(position.intervalPerformancePercent)}`, prive)}
          </span>
        </p>
      </div>
    </div>
  );
}

function DesktopPositionRow({ position, positive, prive, rangeLabel }: { position: PositionRangePerformance; positive: boolean; prive: boolean; rangeLabel: string }) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="hidden min-w-0 gap-4 lg:grid lg:grid-cols-[minmax(0,1.6fr)_112px_minmax(150px,1fr)] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <AssetIcon symbol={position.symbol} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{position.name}</p>
            {position.incompleteData && <span className="rounded bg-amber/15 px-2 py-1 text-[11px] font-semibold text-amber">partiel</span>}
          </div>
          <p className="muted truncate">{masquerValeur(`${formatQuantity(position.quantity)} x ${money(position.averageBuyPrice, position.currency)}`, prive)}</p>
        </div>
      </div>

      <MiniSparkline miniChart={position.miniChart} tone={sparklineTone(position)} />

      <div className="text-right">
        <p className="text-sm text-slate-400">Valeur | Perf {rangeLabel}</p>
        <p className="font-semibold">{masquerValeur(money(position.currentMarketValue, position.currency), prive)}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-sm font-semibold ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={16} />
          {masquerValeur(`${money(position.intervalPerformanceValue, position.currency)} | ${percent(position.intervalPerformancePercent)}`, prive)}
        </p>
      </div>
    </div>
  );
}

/**
 * Formate une quantite de titres en francais.
 */
function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function sparklineTone(position: PositionRangePerformance): "positive" | "negative" | "neutral" {
  if (position.intervalPerformanceValue > 0) return "positive";
  if (position.intervalPerformanceValue < 0) return "negative";
  return "neutral";
}

function MiniSparkline({ miniChart, tone }: { miniChart?: PositionRangePerformance["miniChart"]; tone: "positive" | "negative" | "neutral" }) {
  const points = miniChart?.points ?? [];
  const colorClass = tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : "text-slate-400";

  if (points.length < 2) {
    return (
      <div className="h-9 w-[84px] sm:w-28" aria-label="Mini-graph indisponible">
        <div className="mt-[17px] h-px w-full rounded bg-line/80" />
      </div>
    );
  }

  const width = 112;
  const height = 36;
  const padding = 3;
  const sessionDomain = miniChart?.range === "1d" ? miniChartSessionDomain(points[0].t, miniChart.marketSession) : undefined;
  const minT = sessionDomain?.open ?? points[0].t;
  const maxT = sessionDomain?.close ?? points[points.length - 1].t;
  const values = points.map((point) => point.v);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanT = maxT - minT || 1;
  const spanV = maxV - minV || 1;
  const path = points
    .map((point, index) => {
      const x = padding + ((point.t - minT) / spanT) * (width - padding * 2);
      const y = height - padding - ((point.v - minV) / spanV) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-label={`Mini-graph ${miniChart?.range ?? ""}`}
      className={`h-9 w-[84px] overflow-visible sm:w-28 ${colorClass}`}
      focusable="false"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function miniChartSessionDomain(firstTimestamp: number, marketSession?: PositionRangePerformance["miniChart"]["marketSession"]) {
  if (!marketSession) return undefined;
  const timeZone = normalizeTimeZone(marketSession.timezone);
  const day = localIsoDate(new Date(firstTimestamp), timeZone);
  return {
    open: zonedTimeToUtc(day, marketSession.open, timeZone).getTime(),
    close: zonedTimeToUtc(day, marketSession.close, timeZone).getTime()
  };
}
