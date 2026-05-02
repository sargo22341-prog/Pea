/**
 * Rôle du fichier : regrouper les calculs purs sur les transactions du portefeuille.
 *
 * Toutes les fonctions ici travaillent exclusivement en mémoire à partir de
 * données déjà chargées depuis la base. Aucun appel à `db` n'est fait ici.
 * L'objectif est d'éliminer le pattern N+1 qui consiste à interroger SQLite
 * pour chaque position × chaque point de la timeline lors du calcul de performance.
 */

import type { DividendEvent, PositionWithMarket } from "@pea/shared";
import { db } from "../../db.js";
import { dividendsService } from "../market/dividends.service.js";

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

/**
 * Charge en une seule passe toutes les transactions datées pour un ensemble
 * d'identifiants de positions. Remplace les appels répétés à hasDatedTransactions()
 * et aux sélecteurs individuels dans les boucles de calcul.
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
      `SELECT position_id, type, quantity, price, total_fees, traded_at
       FROM transactions
       WHERE position_id IN (${placeholders})
         AND traded_at IS NOT NULL
       ORDER BY traded_at ASC, id ASC`
    )
    .all(...positionIds) as Array<TransactionRow & { position_id: number }>;

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
 * Calcule la quantité détenue à un instant précis à partir d'un tableau de
 * transactions déjà triées par date croissante (garanti par buildTransactionCache).
 *
 * @param transactions Transactions de la position, triées par traded_at ASC.
 * @param timeMs Timestamp Unix en millisecondes représentant l'instant cible.
 * @returns Quantité détenue à cet instant.
 */
export function getQuantityAtTime(transactions: TransactionRow[], timeMs: number): number {
  let quantity = 0;
  for (const row of transactions) {
    if (new Date(row.traded_at).getTime() > timeMs) break;
    if (row.type === "buy") quantity += row.quantity;
    else if (row.type === "sell") quantity -= row.quantity;
  }
  return quantity;
}

/**
 * Calcule le coût total d'acquisition (cost basis) à un instant précis.
 * Utilise la méthode du coût moyen pondéré : lors d'une vente, le coût est
 * réduit proportionnellement au coût moyen unitaire au moment de la vente.
 *
 * @param transactions Transactions de la position, triées par traded_at ASC.
 * @param timeMs Timestamp Unix en millisecondes représentant l'instant cible.
 * @returns Coût total investi net à cet instant.
 */
export function getCostBasisAtTime(transactions: TransactionRow[], timeMs: number): number {
  let quantity = 0;
  let costBasis = 0;

  for (const row of transactions) {
    if (new Date(row.traded_at).getTime() > timeMs) break;

    const rowQuantity = row.quantity;
    if (row.type === "buy") {
      quantity += rowQuantity;
      costBasis += rowQuantity * row.price + (row.total_fees ?? 0);
    } else if (row.type === "sell") {
      const averageCost = quantity > 0 ? costBasis / quantity : 0;
      quantity -= rowQuantity;
      costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
    }
  }

  return costBasis;
}

/**
 * Calcule le total des dividendes reçus pour toutes les positions en mémoire.
 * Remplace la boucle N+1 qui appelait readDividends() + getQuantityHeldAtDate()
 * pour chaque position × chaque événement dividende.
 *
 * @param positions Liste des positions enrichies avec quote.
 * @param txCache Cache de transactions déjà chargé par buildTransactionCache.
 * @returns Somme totale des dividendes reçus.
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
    } catch {
      continue;
    }

    const entry = txCache.get(position.id);
    for (const event of dividends) {
      const eventTime = new Date(event.date).getTime();
      if (!Number.isFinite(eventTime) || eventTime > now) continue;

      let quantity: number;
      if (entry?.hasDated) {
        quantity = getQuantityAtTime(entry.transactions, eventTime);
      } else {
        quantity = position.quantity;
      }

      total += event.amount * quantity;
    }
  }

  return total;
}
