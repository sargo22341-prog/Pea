import type { SplitDecision, UserAssetSplit } from "@pea/shared";
import { db } from "../../../db.js";
import { splitDecisionsRepository, type UserPositionSplitRow } from "../../../repositories/portfolio/split-decisions.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { portfolioWriteService } from "../portfolio-write.service.js";
import { isBeforeSplit } from "./split-adjustment.js";

function statusOf(decision: SplitDecision | null): UserAssetSplit["status"] {
  if (decision === "apply") return "applied";
  if (decision === "ignore") return "ignored";
  return "pending";
}

function toUserSplit(row: UserPositionSplitRow): UserAssetSplit {
  return {
    id: row.id,
    symbol: row.symbol.toUpperCase(),
    assetName: row.asset_name ?? row.position_name,
    positionId: row.position_id,
    date: row.split_date,
    numerator: row.numerator,
    denominator: row.denominator,
    status: statusOf(row.decision)
  };
}

export class SplitDecisionService {
  /**
   * Divisions qui concernent réellement l'utilisateur : au moins une de ses transactions est
   * antérieure à la division. Une position ouverte après la division (ou importée avec des
   * quantités déjà ajustées sans historique) n'est jamais concernée.
   */
  listForUser(userId: number, symbol?: string): UserAssetSplit[] {
    const key = symbol?.toUpperCase();
    const rows = splitDecisionsRepository.listForUserPositions(userId).filter((row) => !key || row.symbol.toUpperCase() === key);
    const datesByPosition = new Map<number, string[]>();
    for (const row of splitDecisionsRepository.transactionDates([...new Set(rows.map((row) => row.position_id))])) {
      datesByPosition.set(row.position_id, [...(datesByPosition.get(row.position_id) ?? []), row.traded_at]);
    }
    return rows
      .filter((row) => (datesByPosition.get(row.position_id) ?? []).some((tradedAt) => isBeforeSplit(tradedAt, { date: row.split_date })))
      .map(toUserSplit);
  }

  /**
   * Enregistre la décision puis recalcule la position et invalide les caches du portefeuille.
   * Une division qui ne concerne pas l'utilisateur répond 404, sans révéler son existence.
   */
  decide(userId: number, splitId: number, decision: SplitDecision): UserAssetSplit {
    const split = this.listForUser(userId).find((item) => item.id === splitId);
    if (!split) throw new HttpError(404, "Division d'action introuvable");
    db.transaction(() => {
      splitDecisionsRepository.upsertDecision(userId, splitId, decision);
      portfolioWriteService.recomputePositionFromAnyTransactions(split.positionId, userId);
      portfolioWriteService.invalidatePositionCaches(split.positionId, userId, split.symbol);
    });
    return { ...split, status: statusOf(decision) };
  }
}

export const splitDecisionService = new SplitDecisionService();
