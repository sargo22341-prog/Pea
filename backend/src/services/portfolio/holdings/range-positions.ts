import { DAY_MS, type Position, type RangeKey } from "@pea/shared";
import { isHeldQuantity } from "../../../repositories/portfolio/held-positions.sql.js";
import { rangeCutoff } from "../../market/charts/chart-range-window.js";
import { latestTransactionTime, type PositionTransactionCache } from "../portfolio-calculations.js";

/** La séance « 1d » affichée peut être celle d'un jour ouvré antérieur (week-end, jours fériés). */
const intradayLookbackMs = 7 * DAY_MS;
/** Marge sous le début de plage : une série de cours peut commencer un peu avant la borne exacte. */
const rangeStartMarginMs = DAY_MS;

/**
 * Une position soldée ne compte dans une courbe que si elle était détenue pendant la plage,
 * c'est-à-dire si sa dernière transaction (la vente totale) tombe dans la plage. Sinon sa
 * quantité y est nulle partout : charger ses cours ne coûterait que des appels Yahoo.
 */
export function isPositionInRange(position: Position, entry: PositionTransactionCache | undefined, range: RangeKey, now = Date.now()) {
  if (isHeldQuantity(position.quantity) || range === "all") return true;
  const start = range === "1d" ? now - intradayLookbackMs : rangeCutoff(range);
  if (start === undefined) return true;
  return latestTransactionTime(entry) >= start - rangeStartMarginMs;
}

export function positionsInRange(positions: Position[], txCache: Map<number, PositionTransactionCache>, range: RangeKey, now = Date.now()) {
  return positions.filter((position) => isPositionInRange(position, txCache.get(position.id), range, now));
}
