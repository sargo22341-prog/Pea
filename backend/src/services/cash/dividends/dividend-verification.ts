import type { DividendVerification, DividendVerificationInfo } from "@pea/shared";
import { dividendVerificationRepository } from "../../../repositories/cash/dividend-verification.repository.js";
import { requireDividendMovement } from "./dividend-credit.js";

interface VerificationColumns {
  verification: DividendVerification | null;
  verified_at: string | null;
  verification_ref: string | null;
}

export function verificationInfo(row: VerificationColumns): DividendVerificationInfo | undefined {
  if (row.verification === null || row.verified_at === null) return undefined;
  return { status: row.verification, verifiedAt: row.verified_at, reference: row.verification_ref ?? undefined };
}

/** Référence d'une ligne de relevé, sans donnée personnelle : `AAAA-MM#ligne`. */
export function statementReference(period: string, lineNo: number) {
  return `${period}#${lineNo}`;
}

/**
 * « Vérifié manuellement » : sans effet sur un dividende certifié par relevé, le document prime.
 * Renvoie vrai si la vérification a été enregistrée.
 */
export function verifyManually(userId: number, movementId: number, now: Date) {
  const movement = requireDividendMovement(userId, movementId);
  if (movement.verification === "document") return false;
  return dividendVerificationRepository.setVerification(userId, movement.id, "manual", now.toISOString(), null);
}

/** Certification par une ligne de relevé ; remplace toute vérification manuelle. */
export function certifyMovement(userId: number, movementId: number, reference: string, now: Date) {
  dividendVerificationRepository.setVerification(userId, movementId, "document", now.toISOString(), reference);
}
