import type { DividendEvent, Position, PositionWithMarket } from "@pea/shared";
import { sqlInList, sqlListParam } from "../../repositories/sql-list.js";
import { db } from "../../db.js";
import { dividendsService } from "../market/dividends/dividends.service.js";
import { logger } from "../shared/logger.service.js";
import { appliedSplitsByPosition } from "./splits/applied-splits.js";
import { adjustTransactionsForSplits } from "./splits/split-adjustment.js";

/**
 * Représente une ligne de transaction brute telle que lue depuis la base.
 * On ne charge que les colonnes nécessaires aux calculs de quantité et coût.
 */
export interface TransactionRow {
  type: string;
  quantity: number;
  price: number;
  total_fees: number | null;
  traded_at: string;
}

/**
 * Cache de transactions pour une position donnée.
 * hasDated indique si des transactions avec date d'exécution existent.
 * Quand hasDated est false, les transactions ne sont pas chargées (inutile).
 */
export interface PositionTransactionCache {
  hasDated: boolean;
  transactions: TransactionRow[];
}

export interface ReplayableTransaction {
  type: string;
  quantity: number | string;
  price: number | string;
  total_fees?: number | string | null;
  traded_at?: string;
}

/**
 * Horodatage d'une transaction. Une date illisible vaut 0 afin que l'ordre reste déterministe.
 */
export function transactionTimeMs(tradedAt: string) {
  const time = new Date(tradedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Rejoue des transactions triées par date croissante avec la méthode du coût moyen pondéré :
 * une vente réduit le coût au prorata du coût moyen unitaire au moment de la vente.
 * Source de vérité unique pour la quantité détenue et le coût d'acquisition d'une position.
 *
 * @param rows Transactions triées par date croissante.
 * @param untilMs Instant cible : les transactions postérieures sont ignorées.
 */
export function replayTransactions(rows: ReplayableTransaction[], untilMs = Number.POSITIVE_INFINITY) {
  const holding: ReplayedHolding = { quantity: 0, costBasis: 0 };
  for (const row of rows) {
    if (untilMs !== Number.POSITIVE_INFINITY && row.traded_at !== undefined && transactionTimeMs(row.traded_at) > untilMs) break;
    applyTransaction(holding, row);
  }
  return holding;
}

export interface ReplayedHolding {
  quantity: number;
  costBasis: number;
}

/** Applique une transaction à une détention (coût moyen pondéré, voir `replayTransactions`). */
export function applyTransaction(holding: ReplayedHolding, row: ReplayableTransaction) {
  const rowQuantity = Number(row.quantity);
  if (row.type === "buy") {
    holding.quantity += rowQuantity;
    holding.costBasis += rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
  } else if (row.type === "sell") {
    const averageCost = holding.quantity > 0 ? holding.costBasis / holding.quantity : 0;
    holding.quantity -= rowQuantity;
    holding.costBasis = Math.max(0, holding.costBasis - averageCost * rowQuantity);
  }
}

/**
 * Charge en une seule passe toutes les transactions datées pour un ensemble
 * d'identifiants de positions. Remplace les appels répétés aux sélecteurs
 * individuels dans les boucles de calcul.
 *
 * @param positionIds Liste des identifiants de positions à charger.
 * @returns Map positionId → cache de transactions.
 */
export function buildTransactionCache(positionIds: number[]): Map<number, PositionTransactionCache> {
  const cache = new Map<number, PositionTransactionCache>();

  if (!positionIds.length) return cache;

  // Initialise toutes les positions sans transactions datées par défaut
  for (const id of positionIds) {
    cache.set(id, { hasDated: false, transactions: [] });
  }

  // Une seule requête pour charger toutes les transactions datées en une passe
  const rows = db
    .prepare(
      `SELECT id, position_id, type, quantity, price, total_fees, traded_at
       FROM transactions
       WHERE position_id IN ${sqlInList}
         AND traded_at IS NOT NULL`
    )
    .all(sqlListParam(positionIds)) as (TransactionRow & { id: number; position_id: number })[];

  // Tri sur l'instant réel : l'ordre textuel SQL est faux dès que des dates portent des
  // fuseaux ou formats différents, et les calculs "à un instant" s'arrêtent au premier dépassement.
  rows.sort((a, b) => transactionTimeMs(a.traded_at) - transactionTimeMs(b.traded_at) || a.id - b.id);

  for (const row of rows) {
    const entry = cache.get(row.position_id);
    if (!entry) continue;
    entry.hasDated = true;
    entry.transactions.push({
      type: row.type,
      quantity: row.quantity,
      price: row.price,
      total_fees: row.total_fees ?? null,
      traded_at: row.traded_at
    });
  }

  // Divisions d'actions validées par l'utilisateur : lecture ajustée, lignes stockées intactes.
  for (const [positionId, splits] of appliedSplitsByPosition(positionIds)) {
    const entry = cache.get(positionId);
    if (entry) entry.transactions = adjustTransactionsForSplits(entry.transactions, splits);
  }

  return cache;
}

/**
 * Calcule la quantité détenue à un instant précis.
 *
 * @param transactions Transactions de la position, triées par date croissante (garanti par buildTransactionCache).
 * @param timeMs Timestamp Unix en millisecondes représentant l'instant cible.
 */
export function getQuantityAtTime(transactions: TransactionRow[], timeMs: number): number {
  return replayTransactions(transactions, timeMs).quantity;
}

/**
 * Calcule le coût total d'acquisition (cost basis) à un instant précis.
 *
 * @param transactions Transactions de la position, triées par date croissante.
 * @param timeMs Timestamp Unix en millisecondes représentant l'instant cible.
 */
export function getCostBasisAtTime(transactions: TransactionRow[], timeMs: number): number {
  return replayTransactions(transactions, timeMs).costBasis;
}

/**
 * Reconstruit la quantité et le prix moyen d'une position à partir du cache
 * de transactions déjà chargé en mémoire.
 *
 * @param position Position de référence (id, symbol, name…).
 * @param transactions Transactions triées par date croissante issues du cache.
 */
export function positionFromTransactionCache(position: Position, transactions: TransactionRow[]): Position {
  if (!transactions.length) return position;
  const { quantity, costBasis } = replayTransactions(transactions);
  return {
    ...position,
    quantity,
    averageBuyPrice: quantity > 0 ? costBasis / quantity : 0
  };
}

/**
 * Montant des dividendes déjà versés pour une position, en tenant compte de la quantité
 * détenue à la date de chaque événement lorsque l'historique de transactions est disponible.
 */
export function dividendsReceivedFor(
  position: Pick<Position, "quantity">,
  dividends: DividendEvent[],
  entry?: PositionTransactionCache,
  now = Date.now()
): number {
  let total = 0;
  for (const event of dividends) {
    const eventTime = new Date(event.date).getTime();
    if (!Number.isFinite(eventTime) || eventTime > now) continue;
    const quantity = entry?.hasDated ? getQuantityAtTime(entry.transactions, eventTime) : position.quantity;
    total += event.amount * quantity;
  }
  return total;
}

/**
 * Calcule le total des dividendes reçus pour toutes les positions en mémoire.
 *
 * @param positions Liste des positions enrichies avec quote.
 * @param txCache Cache de transactions déjà chargé par buildTransactionCache.
 */
export function computeTotalDividendsReceived(
  positions: PositionWithMarket[],
  txCache: Map<number, PositionTransactionCache>
): number {
  const now = Date.now();
  let total = 0;

  for (const position of positions) {
    let dividends: DividendEvent[];
    try {
      dividends = dividendsService.readDividends(position.symbol);
    } catch (error) {
      logger.warn("portfolio", "dividends unavailable for received total", {
        symbol: position.symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }
    total += dividendsReceivedFor(position, dividends, txCache.get(position.id), now);
  }

  return total;
}

/** Instant de la transaction la plus récente d'une position (0 si aucune). */
export function latestTransactionTime(entry?: PositionTransactionCache) {
  return entry?.transactions.reduce((latest, transaction) => Math.max(latest, new Date(transaction.traded_at).getTime()), 0) ?? 0;
}

/**
 * Réduit une série à au plus maxPoints éléments en conservant le premier, le dernier et
 * des points intermédiaires régulièrement espacés. Utilisé pour les grandes plages et les
 * mini-graphiques dont les milliers de points ralentissent la sérialisation et le rendu.
 *
 * @param points Points triés par date croissante.
 * @param maxPoints Nombre maximum de points à conserver (au moins 2).
 * @returns Sous-ensemble réduit, ou l'original si déjà sous le seuil.
 */
export function downsamplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const result: T[] = [];
  const last = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    const point = points[Math.round((index * last) / (maxPoints - 1))];
    if (point !== undefined) result.push(point);
  }
  return result;
}
