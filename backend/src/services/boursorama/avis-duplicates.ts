import type { EditablePortfolioTransaction, ParsedAvisOperation } from "@pea/shared";
import { localDayKey } from "../timezone/date-time.service.js";

const quantityTolerance = 0.000001;
const duplicateWarning = "Doublon possible.";

type ExistingTransaction = Pick<EditablePortfolioTransaction, "tradedAt" | "quantity" | "type">;

function operationType(operation: ParsedAvisOperation) {
  if (operation.sensOperation === "achat") return "buy";
  if (operation.sensOperation === "vente") return "sell";
  return undefined;
}

/** Jour d'exécution tel qu'imprimé sur l'avis (heure locale, sans fuseau). */
function operationDay(operation: ParsedAvisOperation) {
  return operation.dateExecution?.slice(0, 10);
}

function sameQuantity(a: number, b: unknown) {
  return Math.abs(a - Number(b)) < quantityTolerance;
}

/**
 * Vrai si l'opération correspond probablement à une transaction déjà enregistrée sur la position
 * de l'actif : même jour d'exécution (fuseau de l'application), même quantité et même sens.
 * Les transactions comparées sont celles de la position, quelle que soit leur origine.
 */
export function isDuplicateOfExistingTransaction(operation: ParsedAvisOperation, existing: ExistingTransaction[], timeZone: string) {
  const day = operationDay(operation);
  if (!day || !operation.quantite) return false;
  const type = operationType(operation);
  return existing.some((transaction) =>
    localDayKey(new Date(transaction.tradedAt), timeZone) === day &&
    sameQuantity(transaction.quantity, operation.quantite) &&
    (!type || transaction.type === type)
  );
}

function batchKey(operation: ParsedAvisOperation) {
  const symbol = (operation.selectedSymbol ?? operation.resolvedAsset?.symbol ?? "").toUpperCase();
  const day = operationDay(operation);
  if (!symbol || !day || !operation.quantite) return undefined;
  return [symbol, day, Number(operation.quantite), operation.sensOperation].join("|");
}

export function withDuplicateWarning(operation: ParsedAvisOperation): ParsedAvisOperation {
  if (operation.potentialDuplicate) return operation;
  return { ...operation, potentialDuplicate: true, warnings: [...operation.warnings, duplicateWarning] };
}

/** Signale les opérations répétées dans un même lot (le même avis envoyé deux fois). */
export function markDuplicatesWithinBatch(operations: ParsedAvisOperation[]) {
  const seen = new Set<string>();
  return operations.map((operation) => {
    const key = batchKey(operation);
    if (!key) return operation;
    if (seen.has(key)) return withDuplicateWarning(operation);
    seen.add(key);
    return operation;
  });
}
