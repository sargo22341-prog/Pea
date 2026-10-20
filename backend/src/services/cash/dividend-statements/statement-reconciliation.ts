import { DAY_MS, type DividendStatementCase, type WithholdingComparison } from "@pea/shared";
import type { CashAccountRow, CashMovementRow } from "../../../repositories/cash/cash.repository.js";
import type { DividendProposalRow } from "../../../repositories/cash/dividend-proposals.repository.js";
import type { StatementLineRow, StatementPositionRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { entryTimeMs, isAbsorbed } from "../cash-ledger.js";
import { DIVIDEND_RECONCILIATION_WINDOW_DAYS, isSameDividendCredit } from "../dividends/dividend-proposal-rules.js";
import { statementReference } from "../dividends/dividend-verification.js";
import { estimateWithholding } from "../dividends/withholding-tax.js";
import type { ParsedStatementLine } from "./parser/statement-parser.js";

/**
 * Rapprochement d'une ligne de relevé avec le compte espèces (règles pures, sans écriture).
 * L'actif est identifié par son ISIN, jamais par son nom ; la date par `isSameDividendCredit` ;
 * le montant au centime près.
 */

/** Retenue réelle jugée cohérente avec le taux estimé : écart d'au plus 2 % du brut ou 2 centimes. */
export const WITHHOLDING_NOTABLE_GAP_RATIO = 0.02;
export const WITHHOLDING_NOTABLE_GAP_MIN_CENTS = 2;

const statementTimeZone = "Europe/Paris";
const parisDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: statementTimeZone, year: "numeric", month: "2-digit", day: "2-digit" });

export interface StatementContext {
  account: CashAccountRow;
  positions: StatementPositionRow[];
  /** Mouvements `dividend` de l'utilisateur. */
  movements: CashMovementRow[];
  /** Propositions en attente ou ignorées. */
  proposals: DividendProposalRow[];
  /** Lignes déjà certifiées comme dividendes perçus avant l'état initial. */
  statementLines: StatementLineRow[];
  now: Date;
}

export interface LineClassification {
  case: DividendStatementCase;
  position?: StatementPositionRow | undefined;
  movement?: CashMovementRow | undefined;
  proposal?: DividendProposalRow | undefined;
  possibleDuplicate?: boolean | undefined;
}

/** Jour calendaire à Paris (le relevé est daté en heure française). */
export function parisDay(iso: string) {
  return parisDayFormat.format(new Date(iso));
}

/** Date de crédit d'une ligne : le jour du relevé, à midi (UTC), pour rester dans ce jour à Paris. */
export function lineEffectiveAt(paymentDate: string) {
  return `${paymentDate}T12:00:00.000Z`;
}

/** Position unique portant cet ISIN ; plusieurs positions avec le même ISIN ne sont pas départagées. */
export function positionForIsin(positions: readonly StatementPositionRow[], isin: string) {
  const matches = positions.filter((position) => position.isin?.toUpperCase() === isin);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Mouvement de dividende du même actif le plus proche dans la fenêtre de rapprochement. */
export function closestMovement(movements: readonly CashMovementRow[], symbol: string, effectiveAt: string) {
  const time = entryTimeMs(effectiveAt);
  return movements
    .filter((movement) => isSameDividendCredit({ symbol: movement.symbol, effectiveAt: movement.effective_at }, { symbol, effectiveAt }))
    .sort((a, b) => Math.abs(entryTimeMs(a.effective_at) - time) - Math.abs(entryTimeMs(b.effective_at) - time))[0];
}

/** Même montant au centime et même jour (à Paris). */
export function sameCredit(movement: Pick<CashMovementRow, "amount_cents" | "effective_at">, line: Pick<ParsedStatementLine, "netCents" | "paymentDate">) {
  return movement.amount_cents === line.netCents && parisDay(movement.effective_at) === line.paymentDate;
}

/** Un dividende saisi sans actif, du même montant et proche, pourrait être ce versement. */
function unlinkedDuplicate(context: StatementContext, line: ParsedStatementLine, effectiveAt: string) {
  const time = entryTimeMs(effectiveAt);
  return context.movements.some((movement) => !movement.symbol && movement.amount_cents === line.netCents
    && Math.abs(entryTimeMs(movement.effective_at) - time) <= DIVIDEND_RECONCILIATION_WINDOW_DAYS * DAY_MS);
}

export function classifyLine(context: StatementContext, period: string, line: ParsedStatementLine, chosenPosition?: StatementPositionRow): LineClassification {
  const effectiveAt = lineEffectiveAt(line.paymentDate);
  if (entryTimeMs(effectiveAt) > context.now.getTime()) return { case: "future" };
  const position = chosenPosition ?? positionForIsin(context.positions, line.isin);
  // Déjà compris dans le solde déclaré : jamais crédité, même pour une position soldée depuis.
  if (isAbsorbed(effectiveAt, context.account.reference_at ?? undefined)) {
    const stored = context.statementLines.some((row) => row.period === period && row.line_no === line.lineNo);
    return { case: stored ? "already_certified" : "opening", position };
  }
  if (!position) return { case: "unknown_asset" };
  const movement = closestMovement(context.movements, position.symbol, effectiveAt);
  if (movement) {
    if (!sameCredit(movement, line)) return { case: "mismatch", position, movement };
    const certified = movement.verification === "document" && movement.verification_ref === statementReference(period, line.lineNo);
    return { case: certified ? "already_certified" : "certify", position, movement };
  }
  const proposal = context.proposals.find((row) => row.status !== "accepted" && isSameDividendCredit({ symbol: row.symbol, effectiveAt: row.payment_at }, { symbol: position.symbol, effectiveAt }));
  if (proposal) return { case: "proposal", position, proposal };
  return { case: "create", position, possibleDuplicate: unlinkedDuplicate(context, line, effectiveAt) };
}

/** Retenue réelle (« Crédit d'impôt ») comparée au taux estimé du pays de la société. */
export function compareWithholding(line: ParsedStatementLine, symbol: string): WithholdingComparison | undefined {
  if (line.grossCents <= 0) return undefined;
  const estimatedRate = estimateWithholding(line.isin, symbol).rate;
  const gap = Math.abs(line.withholdingCents - Math.round(line.grossCents * estimatedRate));
  return {
    actualRate: line.withholdingCents / line.grossCents,
    estimatedRate,
    notable: gap > Math.max(WITHHOLDING_NOTABLE_GAP_MIN_CENTS, line.grossCents * WITHHOLDING_NOTABLE_GAP_RATIO)
  };
}
