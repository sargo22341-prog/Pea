import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import type { TFunction } from "i18next";
import { currentDateTimeLocalValue } from "../../../lib/dateTimeInput";

export type EditableTransactionFormRow = Omit<EditablePortfolioTransaction, "quantity" | "price" | "executedPrice" | "totalFees"> & {
  quantity: string;
  price: string;
  executedPrice: string;
  totalFees: string;
  /** Effet de la transaction enregistrée sur la quantité détenue, divisions appliquées (+ achat, - vente, 0 brouillon). */
  savedQuantityEffect: number;
};

type Translate = TFunction;

export function toFormRow(row: EditablePortfolioTransaction): EditableTransactionFormRow {
  return {
    ...row,
    quantity: String(row.quantity),
    price: String(row.price),
    executedPrice: String(row.executedPrice ?? row.price),
    totalFees: String(row.totalFees ?? 0),
    savedQuantityEffect: (row.type === "sell" ? -row.quantity : row.quantity) * (row.splitFactor ?? 1)
  };
}

export function draftTransaction(position: PositionWithMarket): EditableTransactionFormRow {
  const now = currentDateTimeLocalValue();
  return {
    id: `draft-${Date.now()}`,
    positionId: position.id,
    assetId: String(position.id),
    source: "manual",
    dateExecution: now,
    tradedAt: now,
    assetName: position.name,
    ticker: position.symbol,
    type: "buy",
    quantity: "",
    executedPrice: "",
    price: "",
    totalFees: "0",
    currency: position.currency,
    createdAt: now,
    savedQuantityEffect: 0
  };
}

/**
 * Quantité maximale vendable pour une ligne : la quantité détenue sans l'effet de la transaction
 * éditée. Sans cette exclusion, modifier une vente existante (même son seul prix) serait bloqué
 * dès que la position restante est inférieure à la quantité vendue. La quantité détenue tient compte
 * des divisions d'actions validées : la limite est ramenée aux unités saisies sur la ligne. Le backend
 * reste l'arbitre final.
 */
export function maxSellQuantity(row: EditableTransactionFormRow, position: PositionWithMarket) {
  return Math.max(0, (position.quantity - row.savedQuantityEffect) / (row.splitFactor ?? 1));
}

export function parseNonNegativeNumber(value: string, label: string, t: Translate) {
  if (!value.trim()) throw new Error(t("errors:required", { field: label }));
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error(t("errors:invalidField", { field: label }));
  return numberValue;
}

export function errorMessage(error: unknown, t: Translate) {
  return error instanceof Error ? error.message : t("errors:unknown");
}
