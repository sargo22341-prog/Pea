import type { ParsedAvisOperation } from "@pea/shared";
import { config } from "../../config.js";
import { portfolioRepository, type TradeIdentityRow } from "../../repositories/portfolio/portfolio.repository.js";
import { findIdenticalTrades, isSameInstant, type TradeIdentity } from "../portfolio/duplicates/identical-trades.js";
import { toUtcIso } from "../timezone/wall-clock.js";

export const alreadyRecordedMessage = "Operation deja enregistree : l'import lui ajoutera la reference de l'avis sans rien creer.";
export const ambiguousRecordedMessage = "Plusieurs operations identiques sont deja enregistrees : rien n'est cree ni modifie.";

/** Référence d'import d'un avis : préfixée pour ne jamais rencontrer une autre origine. */
export function avisImportRef(reference: string | undefined) {
  return reference ? `pdf:${reference}` : undefined;
}

/** Identité d'une opération lue sur un avis, si sens, quantité, cours et date sont connus. */
export function avisTradeIdentity(operation: Pick<ParsedAvisOperation, "sensOperation" | "quantite" | "coursExecute" | "dateExecution" | "reference">): TradeIdentity | undefined {
  if (operation.sensOperation === "inconnu" || !operation.dateExecution) return undefined;
  const quantity = Number(operation.quantite);
  const price = Number(operation.coursExecute);
  const tradedAt = toUtcIso(operation.dateExecution, config.appTimezone);
  if (!tradedAt || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price)) return undefined;
  return { type: operation.sensOperation === "vente" ? "sell" : "buy", quantity, price, tradedAt, importRef: avisImportRef(operation.reference) ?? null };
}

export type ExistingTradeMatch = { kind: "none" } | { kind: "unique"; positionId: number; trade: TradeIdentityRow } | { kind: "ambiguous" };

/**
 * Opération déjà enregistrée (sans référence d'ordre ou avec la même) que l'avis décrit. Parmi
 * plusieurs candidates, seule une exécution au même instant départage ; sinon le cas est ambigu
 * et rien ne doit être choisi en silence.
 */
export function findExistingTrade(userId: number, symbol: string, identity: TradeIdentity): ExistingTradeMatch {
  const position = portfolioRepository.findPositionBySymbol(symbol.toUpperCase(), userId);
  if (!position) return { kind: "none" };
  const matches = findIdenticalTrades(position.id, identity);
  if (!matches.length) return { kind: "none" };
  const sameInstant = matches.filter((row) => isSameInstant(row.traded_at, identity.tradedAt));
  const [only] = matches.length === 1 ? matches : sameInstant.length === 1 ? sameInstant : [];
  return only ? { kind: "unique", positionId: position.id, trade: only } : { kind: "ambiguous" };
}

/** Complète la référence d'ordre et l'ISIN de l'opération retrouvée : rien n'est créé. */
export function completeExistingTrade(match: Extract<ExistingTradeMatch, { kind: "unique" }>, identity: TradeIdentity, isin: string | null | undefined) {
  portfolioRepository.completeTradeImport(match.positionId, match.trade.id, identity.importRef ?? null, isin ?? null);
}
