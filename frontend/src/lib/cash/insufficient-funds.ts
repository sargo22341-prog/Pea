import type { InsufficientFundsDetails } from "@pea/shared";
import { isApiError } from "../api-core";

/** Détails d'un refus « solde espèces insuffisant » (HTTP 422), ou `undefined` pour toute autre erreur. */
export function insufficientFundsDetails(error: unknown): InsufficientFundsDetails | undefined {
  if (!isApiError(error) || error.status !== 422) return undefined;
  const details = error.details as Partial<InsufficientFundsDetails> | undefined;
  if (details?.code !== "INSUFFICIENT_FUNDS") return undefined;
  if (typeof details.shortfall !== "number" || typeof details.available !== "number" || typeof details.required !== "number") return undefined;
  return {
    code: "INSUFFICIENT_FUNDS",
    available: details.available,
    required: details.required,
    shortfall: details.shortfall,
    effectiveAt: typeof details.effectiveAt === "string" ? details.effectiveAt : "",
    fundable: details.fundable === true
  };
}
