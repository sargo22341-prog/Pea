import { CASH_STATEMENT_VERIFIED_CODE, type CashStatementCheck } from "@pea/shared";
import { isApiError } from "../api-core";

/** Élément rapproché d'une ligne de relevé espèces : le modifier ou le supprimer retire la vérification. */
export function isCashVerified(check: CashStatementCheck | undefined) {
  return check?.status === "verified";
}

/** Vrai pour un refus « élément vérifié par relevé espèces » (HTTP 409), à confirmer explicitement. */
export function isCashStatementVerifiedError(error: unknown) {
  if (!isApiError(error) || error.status !== 409) return false;
  const details = error.details as { code?: unknown } | undefined;
  return details?.code === CASH_STATEMENT_VERIFIED_CODE;
}

/** Paramètre de requête d'une suppression confirmée. */
export function unverifyQuery(confirmUnverify: boolean | undefined) {
  return confirmUnverify ? "?confirmUnverify=true" : "";
}
