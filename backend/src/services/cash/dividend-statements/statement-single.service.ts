import type { DividendStatementCheck, DividendStatementCheckOutcome } from "@pea/shared";
import { db } from "../../../db.js";
import type { CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import { dividendVerificationRepository } from "../../../repositories/cash/dividend-verification.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { centsToMoney } from "../cash-ledger.js";
import { invalidateCashViews } from "../cash-movements.service.js";
import { correctDividendMovement, requireDividendMovement, requireReadyAccount } from "../dividends/dividend-credit.js";
import { isSameDividendCredit } from "../dividends/dividend-proposal-rules.js";
import { certifyMovement, statementReference } from "../dividends/dividend-verification.js";
import type { ParsedDividendStatement, ParsedStatementLine } from "./parser/statement-parser.js";
import { lineDto } from "./statement-context.js";
import { lineEffectiveAt, parisDay, sameCredit } from "./statement-reconciliation.js";

export const statementLacksDividendMessage = "Ce relevé ne contient pas ce dividende à cette date.";
export const otherMonthMessage = "Ce relevé est celui d'un autre mois.";
export const unknownIsinMessage = "L'ISIN de cet actif est inconnu : renseignez-le pour rapprocher le relevé.";

interface CheckDetails {
  check: DividendStatementCheck;
  line?: ParsedStatementLine | undefined;
}

/** Mois du crédit et mois suivant : un dividende du 31 figure souvent sur le relevé suivant. */
function plausiblePeriods(effectiveAt: string) {
  const [year = 0, month = 1] = parisDay(effectiveAt).split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return [`${year}-${String(month).padStart(2, "0")}`, next];
}

function movementIsin(userId: number, movement: CashMovementRow) {
  const positions = dividendVerificationRepository.listPositions(userId);
  const position = positions.find((row) => row.id === movement.position_id) ?? positions.find((row) => row.symbol.toUpperCase() === movement.symbol?.toUpperCase());
  return position?.isin?.toUpperCase();
}

function analyse(userId: number, movement: CashMovementRow, statement: ParsedDividendStatement): CheckDetails {
  const expected = { amount: centsToMoney(movement.amount_cents), effectiveAt: movement.effective_at };
  const base = { period: statement.period, expected };
  const isin = movementIsin(userId, movement);
  if (!isin) return { check: { ...base, outcome: "unknown_isin", found: statement.lines.map(lineDto) } };
  const assetLines = statement.lines.filter((line) => line.isin === isin);
  const found = assetLines.map(lineDto);
  const symbol = movement.symbol ?? isin;
  const line = assetLines.find((candidate) => isSameDividendCredit({ symbol, effectiveAt: movement.effective_at }, { symbol, effectiveAt: lineEffectiveAt(candidate.paymentDate) }));
  if (!line) {
    const outcome: DividendStatementCheckOutcome = plausiblePeriods(movement.effective_at).includes(statement.period) ? "not_found" : "other_month";
    return { check: { ...base, outcome, found } };
  }
  let outcome: DividendStatementCheckOutcome = "date_mismatch";
  if (movement.amount_cents !== line.netCents) outcome = "amount_mismatch";
  else if (sameCredit(movement, line)) {
    const certified = movement.verification === "document" && movement.verification_ref === statementReference(statement.period, line.lineNo);
    outcome = certified ? "already_certified" : "match";
  }
  return { check: { ...base, outcome, match: lineDto(line), found }, line };
}

function refusal(details: CheckDetails) {
  const { check } = details;
  if (check.outcome === "amount_mismatch" && check.match) {
    const format = (amount: number) => `${amount.toFixed(2).replace(".", ",")} €`;
    return `Montant différent : ${format(check.expected.amount)} attendus, ${format(check.match.net)} sur le relevé.`;
  }
  if (check.outcome === "date_mismatch") return "Date différente sur le relevé : confirmez la correction pour certifier ce dividende.";
  if (check.outcome === "other_month") return otherMonthMessage;
  if (check.outcome === "unknown_isin") return unknownIsinMessage;
  return statementLacksDividendMessage;
}

/**
 * Vérification d'un dividende avec le relevé du mois concerné. `check` n'écrit rien ;
 * `certify` certifie un dividende conforme, ou le corrige avec les valeurs du relevé puis le
 * certifie si `correct` est confirmé. Un autre cas est refusé (409) avec un message précis.
 */
export const dividendStatementCheckService = {
  check(userId: number, movementId: number, statement: ParsedDividendStatement): DividendStatementCheck {
    requireReadyAccount(userId);
    return analyse(userId, requireDividendMovement(userId, movementId), statement).check;
  },

  certify(userId: number, movementId: number, statement: ParsedDividendStatement, correct: boolean, now = new Date()) {
    db.transaction(() => {
      requireReadyAccount(userId);
      const movement = requireDividendMovement(userId, movementId);
      const details = analyse(userId, movement, statement);
      const { outcome } = details.check;
      if (outcome === "already_certified") return;
      const correctable = outcome === "amount_mismatch" || outcome === "date_mismatch";
      if (!details.line || (outcome !== "match" && !(correctable && correct))) throw new HttpError(409, refusal(details), details.check);
      if (correctable) {
        correctDividendMovement(userId, movement, { amount: centsToMoney(details.line.netCents), effectiveAt: lineEffectiveAt(details.line.paymentDate), confirmUncertify: true }, now);
      }
      certifyMovement(userId, movement.id, statementReference(statement.period, details.line.lineNo), now);
    });
    invalidateCashViews(userId);
  }
};
