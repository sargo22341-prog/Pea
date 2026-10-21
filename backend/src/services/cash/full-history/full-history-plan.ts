import type { FullHistoryBlocker, FullHistoryBlockerCode } from "@pea/shared";
import type { CashAccountRow, CashMovementRow, CashTradeRow } from "../../../repositories/cash/cash.repository.js";
import type { CashStatementLineRow, CashStatementRow } from "../../../repositories/cash/cash-statements.repository.js";
import type { StatementLineRow, StatementPositionRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { isAbsorbed } from "../cash-ledger.js";
import { createdEffectiveAt } from "../cash-statements/statement-context.js";
import { continuityOf } from "../cash-statements/statement-continuity.js";
import { lineKey, linkedElementId } from "../cash-statements/statement-keys.js";
import { parisDay, positionForIsin } from "../dividend-statements/statement-reconciliation.js";

/**
 * Plan du passage en historique complet (règles pures, sans écriture). Le passage n'est possible
 * que si les relevés espèces importés couvrent tout, de l'ouverture (0 € puis un virement) à la date
 * de départ, sans rupture de solde, et si chaque ligne d'avant la date de départ correspond à un
 * élément de l'application, et inversement : rien n'est alors compté deux fois ni oublié.
 */

/** Nombre d'éléments cités par raison de refus : le compte suffit au-delà. */
export const FULL_HISTORY_REFERENCES_SHOWN = 10;

/** Natures de ligne créées par le passage (résumées jusque-là par l'état initial). */
const creatableKinds = new Set(["deposit", "withdrawal", "fee", "capital_repayment", "compensation"] as const);
type CreatableKind = typeof creatableKinds extends Set<infer T> ? T : never;

export interface FullHistoryContext {
  account: CashAccountRow;
  statements: CashStatementRow[];
  lines: CashStatementLineRow[];
  trades: CashTradeRow[];
  movements: CashMovementRow[];
  /** Lignes de relevé de coupons d'avant l'état initial (dividendes déjà perçus certifiés). */
  dividendLines: StatementLineRow[];
  positions: StatementPositionRow[];
}

export interface CreationStep {
  line: CashStatementLineRow & { kind: CreatableKind };
  effectiveAt: string;
}

export interface DividendConversionStep {
  dividendLine: StatementLineRow;
  position: StatementPositionRow;
}

export interface FullHistoryPlan {
  blockers: FullHistoryBlocker[];
  referenceAt?: string | undefined;
  creations: CreationStep[];
  conversions: DividendConversionStep[];
  /** Date du virement d'ouverture : complète la date d'ouverture du PEA si elle est inconnue. */
  openedAt?: string | undefined;
}

function isCreatable(line: CashStatementLineRow): line is CreationStep["line"] {
  return creatableKinds.has(line.kind as CreatableKind);
}

class Blockers {
  readonly list: FullHistoryBlocker[] = [];

  add(code: FullHistoryBlockerCode, references: readonly string[]) {
    if (references.length) this.list.push({ code, count: references.length, references: references.slice(0, FULL_HISTORY_REFERENCES_SHOWN) });
  }
}

/** Relevés qui ne reprennent pas le solde du précédent (hors mois sans opération et changement de compte). */
function continuityBreaks(statements: readonly CashStatementRow[], lines: readonly CashStatementLineRow[]) {
  const balances = statements.map((statement) => ({
    period: statement.period,
    openingCents: statement.opening_cents,
    closingCents: statement.closing_cents,
    transferCents: lines.filter((line) => line.period === statement.period && line.kind === "balance_transfer").reduce((sum, line) => sum + line.amount_cents, 0)
  }));
  return balances.flatMap((statement, index) => {
    const continuity = continuityOf(statement, balances[index - 1]);
    const broken = continuity.status === "balance_break" || (continuity.status === "gap" && continuity.balanceMatches !== true);
    return broken ? [statement.period] : [];
  });
}

export function planFullHistory(context: FullHistoryContext): FullHistoryPlan {
  const { account } = context;
  const blockers = new Blockers();
  if (account.status !== "ready") return { blockers: [{ code: "not_ready", count: 1, references: [] }], creations: [], conversions: [] };
  const referenceAt = account.reference_at ?? undefined;
  if (referenceAt === undefined) return { blockers: [{ code: "already_full", count: 1, references: [] }], creations: [], conversions: [] };
  const statements = [...context.statements].sort((a, b) => a.period.localeCompare(b.period));
  const first = statements[0];
  const last = statements.at(-1);
  if (!first || !last) return { blockers: [{ code: "no_statements", count: 1, references: [] }], referenceAt, creations: [], conversions: [] };

  const openingDeposit = context.lines.find((line) => line.period === first.period && line.kind === "deposit");
  blockers.add("first_statement_not_opening", first.opening_cents === 0 && openingDeposit ? [] : [first.period]);
  blockers.add("continuity_break", continuityBreaks(statements, context.lines));
  blockers.add("not_covered", last.closing_date >= parisDay(referenceAt) ? [] : [last.period]);

  const beforeStart = (line: CashStatementLineRow) => isAbsorbed(createdEffectiveAt({ kind: line.kind, operationDate: line.operation_date, couponDate: line.coupon_date ?? undefined }), referenceAt);
  const openLines = context.lines.filter((line) => linkedElementId(line) === undefined && line.kind !== "balance_transfer" && beforeStart(line));
  const keyOf = (line: CashStatementLineRow) => lineKey(line.period, line.line_no);
  blockers.add("missing_trade_notices", openLines.filter((line) => line.kind === "buy" || line.kind === "sell").map(keyOf));
  blockers.add("missing_coupon_statements", openLines.filter((line) => line.kind === "dividend").map(keyOf));

  const linked = new Set(context.lines.map(linkedElementId).filter((id): id is string => id !== undefined));
  const unmatched = [
    ...context.trades.filter((trade) => isAbsorbed(trade.traded_at, referenceAt)).map((trade) => `transaction:${String(trade.id)}`),
    ...context.movements.filter((movement) => isAbsorbed(movement.effective_at, referenceAt)).map((movement) => `movement:${String(movement.id)}`)
  ].filter((id) => !linked.has(id));
  blockers.add("unmatched_entries", unmatched);

  const conversions: DividendConversionStep[] = [];
  const unmatchedCoupons: string[] = [];
  const withoutPosition: string[] = [];
  for (const dividendLine of context.dividendLines) {
    const key = lineKey(dividendLine.period, dividendLine.line_no);
    if (!linked.has(`statement-line:${String(dividendLine.id)}`)) {
      unmatchedCoupons.push(key);
      continue;
    }
    const position = positionForIsin(context.positions, dividendLine.isin.toUpperCase());
    if (position) conversions.push({ dividendLine, position });
    else withoutPosition.push(key);
  }
  blockers.add("unmatched_coupon_lines", unmatchedCoupons);
  blockers.add("coupon_without_position", withoutPosition);

  return {
    blockers: blockers.list,
    referenceAt,
    creations: openLines.filter(isCreatable).map((line) => ({ line, effectiveAt: createdEffectiveAt({ kind: line.kind, operationDate: line.operation_date }) })),
    conversions,
    openedAt: openingDeposit ? createdEffectiveAt({ kind: "deposit", operationDate: openingDeposit.operation_date }) : undefined
  };
}
