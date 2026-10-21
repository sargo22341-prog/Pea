import { DUPLICATE_TRANSACTION_CODE } from "@pea/shared";
import { isApiError } from "../api-core";

/** Vrai pour un refus « opération identique déjà enregistrée » (HTTP 409), à confirmer explicitement. */
export function isDuplicateTransactionError(error: unknown) {
  if (!isApiError(error) || error.status !== 409) return false;
  const details = error.details as { code?: unknown } | undefined;
  return details?.code === DUPLICATE_TRANSACTION_CODE;
}
