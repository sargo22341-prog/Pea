import type { ReplayedHolding } from "../portfolio-calculations.js";

/** Écart en dessous duquel une quantité ou un prix est considéré inchangé. */
export const holdingTolerance = 0.000001;

export interface HoldingTarget {
  quantity: number;
  averageBuyPrice: number;
}

export interface HoldingAdjustment {
  type: "buy" | "sell";
  quantity: number;
  price: number;
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < holdingTolerance;
}

/**
 * Transactions à ajouter après l'historique existant pour que son rejeu (coût moyen pondéré,
 * voir `replayTransactions`) aboutisse exactement à la détention cible.
 *
 * Les transactions restent ainsi l'unique source de vérité : un import de détention ne fait
 * qu'ajouter des mouvements, il n'écrase jamais la quantité ou le PRU d'une position.
 * - hausse de quantité : un achat du complément, au prix implicite qui donne le PRU cible ;
 * - baisse de quantité sans changement de PRU : une vente au PRU courant (sans plus-value) ;
 * - sinon (PRU modifié sans achat possible) : vente de toute la ligne au PRU courant puis
 *   rachat de la quantité cible au PRU cible.
 */
export function holdingAdjustments(current: ReplayedHolding, target: HoldingTarget): HoldingAdjustment[] {
  const currentQuantity = Math.max(0, current.quantity);
  const currentAverage = currentQuantity > 0 ? current.costBasis / currentQuantity : 0;
  const quantityDelta = target.quantity - currentQuantity;

  if (nearlyEqual(quantityDelta, 0) && (currentQuantity === 0 || nearlyEqual(currentAverage, target.averageBuyPrice))) return [];

  if (quantityDelta > holdingTolerance) {
    const impliedPrice = (target.quantity * target.averageBuyPrice - currentQuantity * currentAverage) / quantityDelta;
    if (impliedPrice >= 0) return [{ type: "buy", quantity: quantityDelta, price: impliedPrice }];
  }

  if (quantityDelta < -holdingTolerance && (target.quantity < holdingTolerance || nearlyEqual(currentAverage, target.averageBuyPrice))) {
    return [{ type: "sell", quantity: -quantityDelta, price: currentAverage }];
  }

  const adjustments: HoldingAdjustment[] = [];
  if (currentQuantity > holdingTolerance) adjustments.push({ type: "sell", quantity: currentQuantity, price: currentAverage });
  if (target.quantity > holdingTolerance) adjustments.push({ type: "buy", quantity: target.quantity, price: target.averageBuyPrice });
  return adjustments;
}
