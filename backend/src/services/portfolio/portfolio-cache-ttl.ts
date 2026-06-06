import type { Position, Quote, RangeKey } from "@pea/shared";
import { assetRepository } from "../../repositories/market/asset.repository.js";
import { isMarketOpen } from "../market/calendars/marketCalendar.service.js";
import { chartConfigService } from "../market/charts/chart-config.service.js";
import { marketSnapshotService } from "../market/snapshots/market-snapshot.service.js";

export const POST_CLOSE_MARKET_TTL_MS = 72 * 60 * 60 * 1000;

export function portfolioCacheTtlMs(range: RangeKey, positions: Position[]) {
  const baseTtl = chartConfigService.getSnapshotRefreshIntervalMs();
  if (range !== "1d" || positions.length === 0) return baseTtl;

  const allPositionsClosed = positions.every((position) => {
    const asset = assetRepository.findBySymbol(position.symbol);
    if (!asset) return false;
    const snapshot = marketSnapshotService.readSnapshot(asset.id);
    return Boolean(snapshot) && !isMarketOpen(snapshot?.marketState);
  });

  return allPositionsClosed ? POST_CLOSE_MARKET_TTL_MS : baseTtl;
}

export function marketAwareCacheTtlMs(range: RangeKey, quote?: Quote) {
  const baseTtl = chartConfigService.getSnapshotRefreshIntervalMs();
  if (range !== "1d") return baseTtl;
  return quote && !isMarketOpen(quote.marketState) ? POST_CLOSE_MARKET_TTL_MS : baseTtl;
}
