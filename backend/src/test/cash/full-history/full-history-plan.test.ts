import assert from "node:assert/strict";
import test from "node:test";
import type { CashAccountRow, CashMovementRow, CashTradeRow } from "../../../repositories/cash/cash.repository.js";
import type { CashStatementLineRow, CashStatementRow } from "../../../repositories/cash/cash-statements.repository.js";
import type { StatementLineRow } from "../../../repositories/cash/dividend-verification.repository.js";
import { planFullHistory, type FullHistoryContext } from "../../../services/cash/full-history/full-history-plan.js";

const account: CashAccountRow = {
  user_id: 1, status: "ready", reference_at: "2021-08-31T20:00:00.000Z", opened_at: null, opening_cash_cents: 0, opening_deposits_cents: 0,
  opening_withdrawals_cents: 0, opening_dividends_cents: null, opening_dividends_certified_at: null, dividend_auto_accept: 0,
  full_history_at: null, full_history_reference_at: null, updated_at: "2021-09-01"
};

function statement(period: string, openingCents: number, closingCents: number, openingDate: string, closingDate: string): CashStatementRow {
  return { id: 1, user_id: 1, period, format: "legacy", opening_date: openingDate, closing_date: closingDate, opening_cents: openingCents, closing_cents: closingCents, fingerprint: period, imported_at: "2021-09-01" };
}

function line(period: string, lineNo: number, kind: CashStatementLineRow["kind"], amountCents: number, operationDate: string, link: Partial<Pick<CashStatementLineRow, "transaction_id" | "movement_id" | "dividend_line_id">> = {}): CashStatementLineRow {
  return {
    id: lineNo, user_id: 1, period, line_no: lineNo, operation_date: operationDate, value_date: null, kind, label: kind, amount_cents: amountCents, quantity: null, name: null,
    coupon_date: null, transaction_id: null, movement_id: null, dividend_line_id: null, matched_at: null, imported_at: "2021-09-01", ...link
  };
}

const trade: CashTradeRow = { id: 7, position_id: 3, symbol: "BN.PA", name: "Danone", type: "buy", quantity: 1, price: 60, total_fees: 1.2, traded_at: "2021-07-08T09:00:00.000Z", source: "pdf_avis_opere", import_ref: null };
const dividendLine: StatementLineRow = { id: 5, user_id: 1, period: "2021-08", line_no: 1, isin: "FR0010208488", name: "ENGIE", payment_date: "2021-08-06", net_cents: 170, withholding_cents: 0, certified_at: "2021-09-01" };

/** Juillet (ouverture) et août 2021, toutes les lignes rapprochées sauf les virements (résumés). */
function context(overrides: Partial<FullHistoryContext> = {}): FullHistoryContext {
  return {
    account,
    statements: [statement("2021-07", 0, 23880, "2021-06-30", "2021-07-31"), statement("2021-08", 23880, 34050, "2021-07-31", "2021-08-31")],
    lines: [
      line("2021-07", 1, "deposit", 30000, "2021-07-06"),
      line("2021-07", 2, "buy", -6120, "2021-07-08", { transaction_id: 7 }),
      line("2021-08", 1, "dividend", 170, "2021-08-10", { dividend_line_id: 5 }),
      line("2021-08", 2, "deposit", 10000, "2021-08-20")
    ],
    trades: [trade],
    movements: [],
    dividendLines: [dividendLine],
    positions: [{ id: 9, symbol: "ENGI.PA", name: "Engie", isin: "FR0010208488" }],
    ...overrides
  };
}

const codes = (value: FullHistoryContext) => planFullHistory(value).blockers.map((blocker) => `${blocker.code}:${blocker.references.join(",")}`);

test("plan d'historique complet : virements à créer, dividendes certifiés à convertir, date d'ouverture", () => {
  const plan = planFullHistory(context());
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.creations.map((step) => [step.line.period, step.line.line_no, step.effectiveAt]), [
    ["2021-07", 1, "2021-07-05T22:00:00.000Z"],
    ["2021-08", 2, "2021-08-19T22:00:00.000Z"]
  ]);
  assert.deepEqual(plan.conversions.map((step) => [step.dividendLine.id, step.position.symbol]), [[5, "ENGI.PA"]]);
  assert.equal(plan.openedAt, "2021-07-05T22:00:00.000Z");
});

test("plan d'historique complet : compte non prêt, déjà complet ou sans relevé", () => {
  assert.deepEqual(codes(context({ account: { ...account, status: "pending" } })), ["not_ready:"]);
  assert.deepEqual(codes(context({ account: { ...account, reference_at: null } })), ["already_full:"]);
  assert.deepEqual(codes(context({ statements: [], lines: [] })), ["no_statements:"]);
});

test("plan d'historique complet : ouverture, continuité et couverture des relevés", () => {
  const [july, august] = context().statements;
  assert.ok(july && august);
  assert.deepEqual(codes(context({ statements: [{ ...july, opening_cents: 100, closing_cents: 23980 }, { ...august, opening_cents: 23980 }] })), ["first_statement_not_opening:2021-07"], "le premier relevé doit partir de 0 €");
  assert.deepEqual(codes(context({ statements: [july, { ...august, opening_cents: 23000 }] })), ["continuity_break:2021-08"]);
  const october = statement("2021-10", 23880, 34050, "2021-09-30", "2021-10-31");
  assert.deepEqual(codes(context({ statements: [july, october], lines: context().lines.map((row) => row.period === "2021-08" ? { ...row, period: "2021-10" } : row) })), [], "mois sans relevé dont le solde se suit : accepté");
  assert.deepEqual(codes(context({ statements: [july, { ...october, opening_cents: 20000 }] })), ["continuity_break:2021-10"], "relevé oublié : refusé");
  assert.deepEqual(codes(context({ statements: [july], lines: context().lines.filter((row) => row.period === "2021-07") })), ["not_covered:2021-07", "unmatched_coupon_lines:2021-08#1"]);
});

test("plan d'historique complet : chaque ligne et chaque opération d'avant la date de départ doivent se correspondre", () => {
  const lines = context().lines;
  const unlink = (period: string, lineNo: number) => lines.map((row) => row.period === period && row.line_no === lineNo ? { ...row, transaction_id: null, dividend_line_id: null } : row);
  assert.deepEqual(codes(context({ lines: unlink("2021-07", 2) })), ["missing_trade_notices:2021-07#2", "unmatched_entries:transaction:7"]);
  assert.deepEqual(codes(context({ lines: unlink("2021-08", 1) })), ["missing_coupon_statements:2021-08#1", "unmatched_coupon_lines:2021-08#1"]);
  const stray: CashMovementRow = { id: 4, user_id: 1, type: "fee", amount_cents: 500, effective_at: "2021-08-15T10:00:00.000Z", position_id: null, symbol: null, source: "manual", import_ref: null, note: null, verification: null, verified_at: null, verification_ref: null };
  const later = { ...stray, id: 6, effective_at: "2021-09-15T10:00:00.000Z" };
  assert.deepEqual(codes(context({ movements: [stray, later] })), ["unmatched_entries:movement:4"], "une opération postérieure à la date de départ n'est pas concernée");
  assert.deepEqual(codes(context({ positions: [] })), ["coupon_without_position:2021-08#1"]);
});

test("plan d'historique complet : un remboursement résumé est créé, la reprise de solde reste neutre", () => {
  const lines = [
    ...context().lines,
    line("2021-08", 3, "capital_repayment", 6125, "2021-08-25"),
    line("2021-08", 4, "balance_transfer", 2506, "2021-08-26")
  ];
  const plan = planFullHistory(context({ lines }));
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.creations.map((step) => step.line.kind), ["deposit", "deposit", "capital_repayment"]);
});
