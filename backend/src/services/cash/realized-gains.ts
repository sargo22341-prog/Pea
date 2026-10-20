import type { CashTradeRow } from "../../repositories/cash/cash.repository.js";
import { applyTransaction, transactionTimeMs, type ReplayedHolding } from "../portfolio/portfolio-calculations.js";
import { appliedSplitsByPosition } from "../portfolio/splits/applied-splits.js";
import { adjustTransactionsForSplits } from "../portfolio/splits/split-adjustment.js";
import { moneyToCents } from "./cash-ledger.js";

/**
 * Plus ou moins-value réalisée par chaque vente, en centimes : produit net de la vente (frais
 * déduits) moins le coût moyen pondéré des titres vendus, divisions validées appliquées. Le
 * rejeu est celui des positions (`applyTransaction`) : PRU et plus-values restent cohérents.
 */
export function realizedGainsBySale(trades: CashTradeRow[]): Map<number, number> {
  const gains = new Map<number, number>();
  const byPosition = new Map<number, CashTradeRow[]>();
  for (const trade of trades) byPosition.set(trade.position_id, [...(byPosition.get(trade.position_id) ?? []), trade]);
  const splits = appliedSplitsByPosition([...byPosition.keys()]);

  for (const [positionId, rows] of byPosition) {
    const sorted = [...rows].sort((a, b) => transactionTimeMs(a.traded_at) - transactionTimeMs(b.traded_at) || a.id - b.id);
    const adjusted = adjustTransactionsForSplits(sorted, splits.get(positionId) ?? []);
    const holding: ReplayedHolding = { quantity: 0, costBasis: 0 };
    for (const row of adjusted) {
      if (row.type === "sell") {
        const averageCost = holding.quantity > 0 ? holding.costBasis / holding.quantity : 0;
        const proceeds = row.quantity * row.price - (row.total_fees ?? 0);
        gains.set(row.id, moneyToCents(proceeds - averageCost * Math.min(row.quantity, Math.max(0, holding.quantity))));
      }
      applyTransaction(holding, row);
    }
  }
  return gains;
}
