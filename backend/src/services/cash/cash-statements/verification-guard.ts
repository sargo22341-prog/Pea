import { CASH_STATEMENT_VERIFIED_CODE } from "@pea/shared";
import { cashStatementsRepository, type CashStatementLink } from "../../../repositories/cash/cash-statements.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { lineKey } from "./statement-keys.js";

export const cashStatementVerifiedMessage = "Cette opération est vérifiée par un relevé espèces : la modifier ou la supprimer retirera cette vérification. Confirmez pour continuer.";

/** Consentement explicite à retirer la vérification par relevé espèces d'un élément modifié. */
export interface UnverifyConsent {
  confirmUnverify?: boolean | undefined;
}

/**
 * Modifier ou supprimer un élément vérifié par un relevé espèces retire sa vérification : sans
 * `confirmUnverify`, l'API répond `409` (`CASH_STATEMENT_VERIFIED`, avec la référence de la ligne)
 * et l'interface affiche l'avertissement avant de renvoyer la demande confirmée.
 */
export function assertUnverifyConsent(userId: number, link: CashStatementLink, consent: UnverifyConsent = {}) {
  const line = cashStatementsRepository.findLineFor(userId, link);
  if (!line || consent.confirmUnverify === true) return;
  throw new HttpError(409, cashStatementVerifiedMessage, { code: CASH_STATEMENT_VERIFIED_CODE, reference: lineKey(line.period, line.line_no) });
}

/** Supprimer une position supprime ses opérations : la même confirmation est exigée si l'une est vérifiée. */
export function assertPositionUnverifyConsent(userId: number, positionId: number, consent: UnverifyConsent = {}) {
  if (consent.confirmUnverify === true || cashStatementsRepository.countLinkedTradesOfPosition(userId, positionId) === 0) return;
  throw new HttpError(409, cashStatementVerifiedMessage, { code: CASH_STATEMENT_VERIFIED_CODE, reference: "" });
}

/** La ligne redevient à rapprocher : un réimport du relevé la vérifiera à nouveau si l'élément y correspond. */
export function releaseVerification(userId: number, link: CashStatementLink) {
  cashStatementsRepository.unlink(userId, link);
}
