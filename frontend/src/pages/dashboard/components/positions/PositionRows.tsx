import type { PositionRangePerformance, PositionWithMarket } from "@pea/shared";
import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DesktopPositionRow } from "./DesktopPositionRow";
import { MobilePositionRow } from "./MobilePositionRow";

// Memo : les bascules d'état du parent (indicateur de rafraîchissement, rendu du dashboard)
// ne re-rendent pas toutes les lignes tant que les données affichées sont inchangées.
export const PositionRows = memo(function PositionRows({
  error,
  pendingSplitSymbols,
  performanceById,
  positions,
  prive,
  rangeLabel
}: {
  error: string | null;
  /** Symboles dont une division d'action attend la décision de l'utilisateur. */
  pendingSplitSymbols: ReadonlySet<string>;
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
          pendingSplit={pendingSplitSymbols.has(position.symbol.toUpperCase())}
          position={position}
          prive={prive}
          rangeLabel={rangeLabel}
        />
      ))}
    </div>
  );
});

function LazyPositionRow({
  position,
  rangeLabel,
  loadedPosition,
  error,
  prive,
  pendingSplit
}: {
  position: PositionWithMarket;
  rangeLabel: string;
  loadedPosition: PositionRangePerformance | null;
  error: string | null;
  prive: boolean;
  pendingSplit: boolean;
}) {
  const [visibleSoon, setVisibleSoon] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = rowRef.current;
    if (!target || visibleSoon) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleSoon(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" }
    );
    observer.observe(target);
    return () => { observer.disconnect(); };
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
        <MobilePositionRow pendingSplit={pendingSplit} position={loadedPosition} positive={positive} prive={prive} signals={position} />
        <DesktopPositionRow pendingSplit={pendingSplit} position={loadedPosition} positive={positive} prive={prive} rangeLabel={rangeLabel} signals={position} />
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
