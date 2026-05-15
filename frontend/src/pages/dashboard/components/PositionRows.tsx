import type { PositionRangePerformance, PositionWithMarket } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { money, percent } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { MiniSparkline } from "./MiniSparkline";
import { sparklineTone } from "./sparklineTone";

export function PositionRows({
  error,
  performanceById,
  positions,
  prive,
  rangeLabel
}: {
  error: string | null;
  performanceById: Map<number, PositionRangePerformance>;
  positions: PositionWithMarket[];
  prive: boolean;
  rangeLabel: string;
}) {
  return (
    <div className="divide-y divide-line">
      {positions.map((position) => (
        <LazyPositionRow
          error={error}
          key={`${position.id}:${rangeLabel}`}
          loadedPosition={performanceById.get(position.id) ?? null}
          position={position}
          prive={prive}
          rangeLabel={rangeLabel}
        />
      ))}
    </div>
  );
}

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
        <PositionRowSkeleton error={error} name={position.name} symbol={position.symbol} />
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
        <p className="truncate whitespace-nowrap text-xs font-semibold tabular-nums">
          {masquerValeur(`${money(position.currentPrice, position.currency)} / ${money(position.currentMarketValue, position.currency)}`, prive)}
        </p>
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
        <p className="font-semibold">
          {masquerValeur(`${money(position.currentPrice, position.currency)} / ${money(position.currentMarketValue, position.currency)}`, prive)}
        </p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-sm font-semibold ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={16} />
          {masquerValeur(`${money(position.intervalPerformanceValue, position.currency)} | ${percent(position.intervalPerformancePercent)}`, prive)}
        </p>
      </div>
    </div>
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}
