import type { PositionWithMarket } from "@pea/shared";
import { assetRepository } from "../../../repositories/market/asset.repository.js";
import { recentConsensusChanges } from "../../market/analysts/recommendation-history.service.js";
import { marketSnapshotService } from "../../market/snapshots/market-snapshot.service.js";
import { positionYieldOnCost } from "./yield-on-cost.js";

/**
 * Enrichissements discrets des lignes du dashboard : rendement sur coût, fourchette 52 semaines
 * et changement récent du consensus. Lectures locales uniquement, aucun appel Yahoo.
 */
export function withPositionSignals(positions: PositionWithMarket[]): PositionWithMarket[] {
  if (!positions.length) return positions;
  const assetIds = new Map<string, number>();
  for (const position of positions) {
    const asset = assetRepository.findBySymbol(position.symbol);
    if (asset) assetIds.set(position.symbol.toUpperCase(), asset.id);
  }
  const changes = recentConsensusChanges([...assetIds.values()]);
  return positions.map((position) => {
    const market = marketSnapshotService.readMarketDto(position.symbol);
    const assetId = assetIds.get(position.symbol.toUpperCase());
    return {
      ...position,
      yieldOnCost: positionYieldOnCost(position.quote?.dividendRate, position.averageBuyPrice),
      fiftyTwoWeekLow: market?.week52Low,
      fiftyTwoWeekHigh: market?.week52High,
      consensusChange: assetId === undefined ? undefined : changes.get(assetId)
    };
  });
}
