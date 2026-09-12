import type { DividendEvent, HistoryPoint, Position, PositionWithMarket } from "@pea/shared";
import { db } from "../../db.js";
import { dividendsService } from "../market/dividends/dividends.service.js";
import { logger } from "../shared/logger.service.js";

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

type ReplayableTransaction = {
  type: string;
  quantity: number | string;
  price: number | string;
  total_fees?: number | string | null;
  traded_at?: string;
};

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
  let quantity = 0;
  let costBasis = 0;
  for (const row of rows) {
    if (untilMs !== Number.POSITIVE_INFINITY && row.traded_at !== undefined && transactionTimeMs(row.traded_at) > untilMs) break;
    const rowQuantity = Number(row.quantity);
    if (row.type === "buy") {
      quantity += rowQuantity;
      costBasis += rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
    } else if (row.type === "sell") {
      const averageCost = quantity > 0 ? costBasis / quantity : 0;
      quantity -= rowQuantity;
      costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
    }
  }
  return { quantity, costBasis };
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
  const placeholders = positionIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, position_id, type, quantity, price, total_fees, traded_at
       FROM transactions
       WHERE position_id IN (${placeholders})
         AND traded_at IS NOT NULL`
    )
    .all(...positionIds) as Array<TransactionRow & { id: number; position_id: number }>;

  // Tri sur l'instant réel : l'ordre textuel SQL est faux dès que des dates portent des
  // fuseaux ou formats différents, et les calculs "à un instant" s'arrêtent au premier dépassement.
  rows.sort((a, b) => transactionTimeMs(a.traded_at) - transactionTimeMs(b.traded_at) || Number(a.id) - Number(b.id));

  for (const row of rows) {
    const entry = cache.get(row.position_id);
    if (!entry) continue;
    entry.hasDated = true;
    entry.transactions.push({
      type: row.type,
      quantity: Number(row.quantity),
      price: Number(row.price),
      total_fees: row.total_fees == null ? null : Number(row.total_fees),
      traded_at: row.traded_at
    });
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

/** Dernier instant connu d'un historique de prix (0 si vide). */
export function maxHistoryTime(points: HistoryPoint[]) {
  return points.reduce((latest, point) => Math.max(latest, new Date(point.date).getTime()), 0);
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
    result.push(points[Math.round((index * last) / (maxPoints - 1))]);
  }
  return result;
}
