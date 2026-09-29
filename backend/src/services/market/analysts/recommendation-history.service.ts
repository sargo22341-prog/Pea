import { DAY_MS } from "@pea/shared";
import { assetRepository } from "../../../repositories/market/asset.repository.js";
import { recommendationHistoryRepository } from "../../../repositories/market/analysts/recommendation-history.repository.js";

/** Durée pendant laquelle un changement de consensus reste signalé sur le dashboard. */
export const CONSENSUS_CHANGE_ALERT_DAYS = 30;

export interface ConsensusChange {
  from: string;
  to: string;
  changedAt: string;
}

/**
 * Mémorise la recommandation consensuelle vue lors d'un rafraîchissement. Seul un changement crée
 * une ligne : le tout premier passage sert de référence et ne déclenche aucune alerte.
 */
export function recordRecommendation(symbol: string, recommendationKey: string | undefined, now = new Date()) {
  if (!recommendationKey) return false;
  const asset = assetRepository.findBySymbol(symbol);
  if (!asset) return false;
  if (recommendationHistoryRepository.latestKey(asset.id) === recommendationKey) return false;
  recommendationHistoryRepository.insert(asset.id, recommendationKey, now.toISOString());
  return true;
}

/** Changements de consensus récents des actifs demandés, indexés par identifiant d'actif. */
export function recentConsensusChanges(assetIds: number[], now = Date.now()): Map<number, ConsensusChange> {
  const since = new Date(now - CONSENSUS_CHANGE_ALERT_DAYS * DAY_MS).toISOString();
  return new Map(recommendationHistoryRepository.recentChanges(assetIds, since).map((row) => [
    row.asset_id,
    { from: row.previous_key, to: row.recommendation_key, changedAt: row.recorded_at }
  ]));
}
