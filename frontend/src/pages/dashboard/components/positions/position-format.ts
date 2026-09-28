import type { PositionWithMarket } from "@pea/shared";

/** Quantité détenue, sans décimales superflues. */
export function formatQuantity(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

/** Signaux discrets d'une ligne, calculés côté serveur avec le résumé du portefeuille. */
export type PositionRowSignals = Pick<PositionWithMarket, "yieldOnCost" | "fiftyTwoWeekLow" | "fiftyTwoWeekHigh" | "consensusChange">;
