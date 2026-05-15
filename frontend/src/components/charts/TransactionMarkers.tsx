import type { PortfolioTransactionMarker } from "@pea/shared";
import { useState } from "react";
import { useAuthenticatedImageUrl } from "../../hooks/useAuthenticatedImageUrl";
import { formatChartDateTime, formatNumber, money } from "../../lib/format";
import { masquerValeur } from "../../lib/privacy";
import type { MarkerGroupPoint, MarkerOverlayPoint } from "./transactionMarkerUtils";

export function TransactionMarkerOverlay({
  currency,
  points,
  userTimezone,
  maskValues
}: {
  currency: string;
  points: MarkerOverlayPoint[];
  userTimezone?: string;
  maskValues: boolean;
}) {
  const [activePoint, setActivePoint] = useState<MarkerOverlayPoint | null>(null);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 h-8">
      {points.map((point) => (
        <button
          aria-label={`${point.markers.length} transaction${point.markers.length > 1 ? "s" : ""}`}
          className="pointer-events-auto absolute top-1/2 flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0"
          key={point.date}
          onBlur={() => setActivePoint(null)}
          onFocus={() => setActivePoint(point)}
          onMouseEnter={() => setActivePoint(point)}
          onMouseLeave={() => setActivePoint(null)}
          style={{ left: point.left }}
          type="button"
        >
          <TransactionMarkerBadge group={point} />
        </button>
      ))}
      {activePoint && (
        <div
          className="pointer-events-none absolute bottom-10 z-20 max-w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-ink/90 p-3 text-xs text-slate-200 shadow-lg backdrop-blur"
          style={{ left: activePoint.left }}
        >
          <TransactionMarkerTooltip currency={currency} markers={activePoint.markers} maskValues={maskValues} userTimezone={userTimezone} />
        </div>
      )}
    </div>
  );
}

function TransactionMarkerBadge({ group }: { group: MarkerGroupPoint }) {
  const markers = group.markers;
  const visibleMarkers = markers.slice(0, 3);
  const extraCount = markers.length - visibleMarkers.length;

  return (
    <span className="flex items-center">
      {visibleMarkers.map((marker, index) => {
        const tone = marker.type === "buy" ? "border-emerald-500/80" : "border-red-500/70";
        return (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border bg-ink shadow ${tone}`}
            key={marker.id}
            style={{ marginLeft: index === 0 ? 0 : -7 }}
          >
            <MarkerIcon className="h-4 w-4 rounded-sm object-contain" marker={marker} />
          </span>
        );
      })}
      {extraCount > 0 && (
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-400 bg-ink text-[9px] font-bold text-slate-200 shadow"
          style={{ marginLeft: -7 }}
        >
          +{extraCount}
        </span>
      )}
    </span>
  );
}

function TransactionMarkerTooltip({
  currency,
  markers,
  userTimezone,
  maskValues
}: {
  currency: string;
  markers: PortfolioTransactionMarker[];
  userTimezone?: string;
  maskValues: boolean;
}) {
  return (
    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
      {markers.map((marker) => {
        const isBuy = marker.type === "buy";
        return (
          <div className="flex gap-2" key={marker.id}>
            <MarkerIcon className="mt-0.5 h-7 w-7 shrink-0 rounded-md object-contain p-0.5" marker={marker} />
            <div>
              <p className="font-medium text-slate-100">{marker.name}</p>
              <p className={isBuy ? "text-emerald-400" : "text-red-400"}>
                {isBuy ? "+" : "-"} {masquerValeur(formatNumber(marker.quantity), maskValues)} {marker.symbol}
              </p>
              <p className="text-slate-400">
                {isBuy ? "Achat" : "Vente"}{marker.price == null ? "" : ` a ${masquerValeur(money(marker.price, currency), maskValues)}`} - {formatChartDateTime(marker.transactionDate, userTimezone)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarkerIcon({ className, marker }: { className: string; marker: PortfolioTransactionMarker }) {
  const apiLogoPath = marker.logoUrl?.startsWith("/api/")
    ? marker.logoUrl
    : `/api/assets/${encodeURIComponent(marker.symbol)}/icon`;
  const apiLogoUrl = useAuthenticatedImageUrl(apiLogoPath, marker.logoUrl ?? marker.symbol);
  const src = marker.logoUrl && !marker.logoUrl.startsWith("/api/") ? marker.logoUrl : apiLogoUrl;
  return src ? <img alt="" className={className} src={src} /> : null;
}
