import { DUPLICATE_TRANSACTION_CODE, type DuplicateTransactionDetails } from "@pea/shared";
import { config } from "../../../config.js";
import { portfolioRepository, type TradeIdentityRow } from "../../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { localDayKey } from "../../timezone/date-time.service.js";

export const duplicateTradeMessage = "Une operation identique existe deja sur cette position. Confirmez pour l'enregistrer une seconde fois.";

/** Les avis d'opéré impriment l'heure d'exécution à la seconde : moins d'une seconde d'écart est le même instant. */
const SAME_INSTANT_TOLERANCE_MS = 1000;
/** Les cours sont imprimés avec quatre décimales au plus. */
const PRICE_TOLERANCE = 0.00005;
const QUANTITY_TOLERANCE = 0.000001;

export interface TradeIdentity {
  type: "buy" | "sell";
  quantity: number;
  price: number;
  /** Instant d'exécution en ISO UTC. */
  tradedAt: string;
  importRef?: string | null | undefined;
}

export function isSameInstant(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) < SAME_INSTANT_TOLERANCE_MS;
}

/**
 * Vrai si l'opération est identique à une opération enregistrée : même sens, et même instant
 * d'exécution ou même jour (fuseau de l'application) avec la même quantité et le même cours. Deux
 * références d'ordre différentes désignent deux ordres distincts, même identiques en tout point.
 */
export function isIdenticalTrade(candidate: TradeIdentity, row: TradeIdentityRow, timeZone: string) {
  if (row.type !== candidate.type) return false;
  if (candidate.importRef && row.import_ref && candidate.importRef !== row.import_ref) return false;
  if (isSameInstant(candidate.tradedAt, row.traded_at)) return true;
  return localDayKey(new Date(candidate.tradedAt), timeZone) === localDayKey(new Date(row.traded_at), timeZone)
    && Math.abs(candidate.quantity - row.quantity) < QUANTITY_TOLERANCE
    && Math.abs(candidate.price - row.price) < PRICE_TOLERANCE;
}

/** Opérations de la position identiques au candidat, la plus proche dans le temps en premier. */
export function findIdenticalTrades(positionId: number, candidate: TradeIdentity, excludeTransactionId?: number) {
  const candidateMs = Date.parse(candidate.tradedAt);
  return portfolioRepository.listTradeIdentities(positionId)
    .filter((row) => row.id !== excludeTransactionId && isIdenticalTrade(candidate, row, config.appTimezone))
    .sort((a, b) => Math.abs(Date.parse(a.traded_at) - candidateMs) - Math.abs(Date.parse(b.traded_at) - candidateMs) || a.id - b.id);
}

/**
 * Refuse (409, `DUPLICATE_TRANSACTION`) une opération identique à une opération enregistrée de la
 * position, sauf confirmation explicite de l'utilisateur (`confirmDuplicate`).
 */
export function assertNoIdenticalTrade(positionId: number, candidate: TradeIdentity, options: { confirmDuplicate?: boolean | undefined; excludeTransactionId?: number | undefined } = {}) {
  if (options.confirmDuplicate === true) return;
  const [match] = findIdenticalTrades(positionId, candidate, options.excludeTransactionId);
  if (!match) return;
  const details: DuplicateTransactionDetails = { code: DUPLICATE_TRANSACTION_CODE, transactionId: match.id };
  throw new HttpError(409, duplicateTradeMessage, details);
}
