import type { SplitDecision } from "@pea/shared";
import { db } from "../../db.js";

export interface UserPositionSplitRow {
  id: number;
  symbol: string;
  asset_name: string | null;
  position_id: number;
  position_name: string;
  split_date: string;
  numerator: number;
  denominator: number;
  decision: SplitDecision | null;
}

export interface AppliedSplitRow {
  position_id: number;
  split_date: string;
  numerator: number;
  denominator: number;
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

/**
 * Décisions d'ajustement des divisions d'actions. Chaque requête est restreinte aux positions de
 * l'utilisateur (jointure `positions.user_id`) : une décision ne peut viser que ses propres titres.
 */
export class SplitDecisionsRepository {
  /** Divisions des actifs détenus par l'utilisateur, avec sa décision éventuelle. */
  listForUserPositions(userId: number): UserPositionSplitRow[] {
    return db.prepare(
      `SELECT s.id, p.symbol, a.name AS asset_name, p.id AS position_id, p.name AS position_name,
              s.split_date, s.numerator, s.denominator, d.decision
       FROM positions p
       JOIN assets a ON a.symbol = p.symbol
       JOIN asset_splits s ON s.asset_id = a.id
       LEFT JOIN user_split_decisions d ON d.asset_split_id = s.id AND d.user_id = p.user_id
       WHERE p.user_id = ?
       ORDER BY s.split_date DESC, s.id DESC`
    ).all(userId) as UserPositionSplitRow[];
  }

  /** Divisions que l'utilisateur propriétaire de chaque position a choisi d'appliquer. */
  appliedForPositions(positionIds: number[]): AppliedSplitRow[] {
    if (!positionIds.length) return [];
    return db.prepare(
      `SELECT p.id AS position_id, s.split_date, s.numerator, s.denominator
       FROM positions p
       JOIN assets a ON a.symbol = p.symbol
       JOIN asset_splits s ON s.asset_id = a.id
       JOIN user_split_decisions d ON d.asset_split_id = s.id AND d.user_id = p.user_id AND d.decision = 'apply'
       WHERE p.id IN (${placeholders(positionIds)})
       ORDER BY s.split_date ASC`
    ).all(...positionIds) as AppliedSplitRow[];
  }

  /** Dates d'exécution de toutes les transactions des positions demandées. */
  transactionDates(positionIds: number[]): { position_id: number; traded_at: string }[] {
    if (!positionIds.length) return [];
    return db.prepare(
      `SELECT position_id, traded_at FROM transactions WHERE position_id IN (${placeholders(positionIds)}) AND traded_at IS NOT NULL`
    ).all(...positionIds) as { position_id: number; traded_at: string }[];
  }

  upsertDecision(userId: number, splitId: number, decision: SplitDecision) {
    db.prepare(
      `INSERT INTO user_split_decisions (user_id, asset_split_id, decision)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, asset_split_id) DO UPDATE SET decision = excluded.decision, decided_at = CURRENT_TIMESTAMP`
    ).run(userId, splitId, decision);
  }
}

export const splitDecisionsRepository = new SplitDecisionsRepository();
