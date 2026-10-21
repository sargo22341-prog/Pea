/**
 * Règle unique « position détenue / position soldée », partagée par les lectures SQL et les
 * services. `positions.quantity` est recalculée par le rejeu des transactions après chaque
 * mutation : une vente totale la ramène à zéro, un nouvel achat la rend de nouveau positive.
 */

/** Quantité résiduelle (arrondi flottant des ventes fractionnées) en dessous de laquelle la position est soldée. */
export const heldQuantityThreshold = 0.000001;

/**
 * Délai pendant lequel une position soldée reste rafraîchie par les tâches Yahoo planifiées :
 * il couvre la clôture de la séance de vente et au moins un passage du rafraîchissement
 * hebdomadaire (détachement survenu juste avant la vente).
 */
export const closedPositionRefreshGraceDays = 7;

export function isHeldQuantity(quantity: number) {
  return quantity > heldQuantityThreshold;
}

/** Condition SQL : la position (alias de la table `positions`) est encore détenue. */
export function heldPositionSql(alias = "positions") {
  return `${alias}.quantity > ${String(heldQuantityThreshold)}`;
}

/**
 * Condition SQL : la position doit encore être rafraîchie depuis Yahoo, c'est-à-dire détenue ou
 * modifiée (vente enregistrée) pendant le délai de grâce. `updated_at` est écrit par SQLite
 * (`CURRENT_TIMESTAMP`), dans le même format que `datetime('now')`.
 */
export function refreshedPositionSql(alias = "positions") {
  return `(${heldPositionSql(alias)} OR ${alias}.updated_at >= datetime('now', '-${String(closedPositionRefreshGraceDays)} days'))`;
}
