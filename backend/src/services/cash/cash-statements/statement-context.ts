import type { CashStatementTarget } from "@pea/shared";
import { config } from "../../../config.js";
import { cashRepository, type CashAccountRow, type CashMovementRow, type CashTradeRow } from "../../../repositories/cash/cash.repository.js";
import { cashStatementsRepository, type CashStatementLineRow, type CashStatementRow } from "../../../repositories/cash/cash-statements.repository.js";
import { dividendProposalsRepository, type DividendProposalRow } from "../../../repositories/cash/dividend-proposals.repository.js";
import { dividendVerificationRepository, type StatementLineRow, type StatementPositionRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { toUtcIso } from "../../timezone/wall-clock.js";
import { centsToMoney, isAbsorbed, tradeCashCents } from "../cash-ledger.js";
import { requireReadyAccount } from "../dividends/dividend-credit.js";
import { lineEffectiveAt as noonOf, parisDay } from "../dividend-statements/statement-reconciliation.js";
import type { MatchElement } from "./matching/line-matching.js";
import type { ParsedCashStatementLine } from "./parser/cash-statement-parser.js";

/** État du compte nécessaire au rapprochement ; un compte espèces non configuré est refusé (409). */
export interface CashStatementContext {
  account: CashAccountRow;
  trades: CashTradeRow[];
  movements: CashMovementRow[];
  /** Lignes de relevé de coupons d'avant l'état initial (dividendes déjà perçus certifiés). */
  dividendLines: StatementLineRow[];
  positions: StatementPositionRow[];
  /** Propositions de dividende en attente ou ignorées. */
  proposals: DividendProposalRow[];
  statements: CashStatementRow[];
  lines: CashStatementLineRow[];
  now: Date;
}

export function loadCashStatementContext(userId: number, now: Date): CashStatementContext {
  return {
    account: requireReadyAccount(userId),
    trades: cashRepository.listTrades(userId),
    movements: cashRepository.listMovements(userId),
    dividendLines: dividendVerificationRepository.listStatementLines(userId),
    positions: dividendVerificationRepository.listPositions(userId),
    proposals: dividendProposalsRepository.listForUser(userId).filter((row) => row.status !== "accepted"),
    statements: cashStatementsRepository.listStatements(userId),
    lines: cashStatementsRepository.listLines(userId),
    now
  };
}

const movementSign: Record<CashMovementRow["type"], 1 | -1> = { deposit: 1, dividend: 1, capital_repayment: 1, compensation: 1, withdrawal: -1, fee: -1 };

/** Transactions, mouvements et lignes de coupons d'avant l'état initial, dans l'ordre chronologique. */
export function matchElements(context: CashStatementContext): MatchElement[] {
  const trades = context.trades.map((trade): MatchElement => ({
    id: `transaction:${String(trade.id)}`,
    kind: trade.type === "sell" ? "sell" : "buy",
    day: parisDay(trade.traded_at),
    effectiveAt: trade.traded_at,
    cashCents: tradeCashCents(trade.type, trade.quantity, trade.price, trade.total_fees),
    quantity: trade.quantity,
    symbol: trade.symbol
  }));
  const movements = context.movements.map((movement): MatchElement => ({
    id: `movement:${String(movement.id)}`,
    kind: movement.type,
    day: parisDay(movement.effective_at),
    effectiveAt: movement.effective_at,
    cashCents: movementSign[movement.type] * movement.amount_cents,
    symbol: movement.symbol ?? undefined
  }));
  // Seules les lignes de coupons couvertes par l'état initial actuel tiennent lieu de dividende.
  const absorbedLines = context.dividendLines.filter((line) => isAbsorbed(noonOf(line.payment_date), context.account.reference_at ?? undefined));
  const dividendLines = absorbedLines.map((line): MatchElement => ({
    id: `statement-line:${String(line.id)}`,
    kind: "dividend",
    day: line.payment_date,
    effectiveAt: noonOf(line.payment_date),
    cashCents: line.net_cents,
    symbol: context.positions.find((position) => position.isin?.toUpperCase() === line.isin)?.symbol
  }));
  return [...trades, ...movements, ...dividendLines].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.id.localeCompare(b.id));
}

export function targetDto(element: MatchElement): CashStatementTarget {
  return { id: element.id, kind: element.kind, effectiveAt: element.effectiveAt, amount: centsToMoney(element.cashCents), symbol: element.symbol, quantity: element.quantity };
}

/**
 * Date d'un élément créé depuis une ligne : un versement au début du jour d'écriture (à Paris),
 * pour précéder les achats qu'il finance le même jour ; un coupon à sa date d'échéance, comme sur
 * le relevé de coupons ; les autres au milieu du jour d'écriture.
 */
export function createdEffectiveAt(line: Pick<ParsedCashStatementLine, "kind" | "operationDate" | "couponDate">) {
  if (line.kind === "deposit") return toUtcIso(`${line.operationDate}T00:00:00`, config.appTimezone) ?? noonOf(line.operationDate);
  if (line.kind === "dividend") return noonOf(line.couponDate ?? line.operationDate);
  return noonOf(line.operationDate);
}
