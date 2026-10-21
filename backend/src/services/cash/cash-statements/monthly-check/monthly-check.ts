import type { CashMissingDocument, CashMonthCheck, CashMonthIssue, CashStatementLineKind } from "@pea/shared";
import { centsToMoney } from "../../cash-ledger.js";
import { previousPeriod, periodsBetween } from "./month-periods.js";

/**
 * Contrôle mensuel du compte (règles pures) : nouveau solde de chaque relevé espèces comparé au
 * solde de l'application à la même date. Une opération rapprochée d'une ligne de relevé compte à la
 * date d'écriture de cette ligne (`accountingDay`), les autres à leur propre jour.
 */

export interface MonthlyCheckItem {
  id: string;
  kind: Exclude<CashStatementLineKind, "balance_transfer">;
  /** Jour d'écriture de la ligne rapprochée, sinon jour de l'opération (à Paris). */
  accountingDay: string;
  amountCents: number;
  /** Résumée par l'état initial. */
  absorbed: boolean;
  linked: boolean;
  label?: string | undefined;
}

export interface MonthlyCheckStatement {
  period: string;
  openingDate: string;
  closingDate: string;
  openingCents: number;
  closingCents: number;
}

export interface MonthlyCheckLine {
  period: string;
  lineNo: number;
  operationDate: string;
  kind: CashStatementLineKind;
  amountCents: number;
  name?: string | undefined;
  linked: boolean;
  /** Coupon ou remboursement certifié par un relevé de coupons. */
  certified: boolean;
  /** Antérieure ou égale à l'état initial. */
  beforeStart: boolean;
}

export interface MonthlyCheckInput {
  /** Jour de la date de départ (à Paris) ; absent pour un historique complet. */
  referenceDay?: string | undefined;
  openingCashCents: number;
  items: MonthlyCheckItem[];
  statements: MonthlyCheckStatement[];
  lines: MonthlyCheckLine[];
  /** Dernier mois écoulé, dont le relevé devrait être disponible. */
  lastPeriod: string;
}

/** Versements, retraits et frais d'avant la date de départ : compris dans l'état initial, jamais rapprochés. */
const openingKinds = new Set<CashStatementLineKind>(["deposit", "withdrawal", "fee"]);

function missingDocumentOf(kind: CashStatementLineKind): CashMissingDocument | undefined {
  if (kind === "buy" || kind === "sell") return "trade_notice";
  if (kind === "dividend" || kind === "capital_repayment") return "coupon_statement";
  return undefined;
}

/**
 * Solde de l'application à la fin du jour `day`, en date d'écriture. Avec un état initial, le solde
 * déclaré sert de base : une opération résumée mais écrite après `day` en est retirée.
 */
export function balanceAtDay(input: Pick<MonthlyCheckInput, "referenceDay" | "openingCashCents" | "items">, day: string) {
  let balance = input.referenceDay === undefined ? 0 : input.openingCashCents;
  for (const item of input.items) {
    if (!item.absorbed && item.accountingDay <= day) balance += item.amountCents;
    if (item.absorbed && item.accountingDay > day) balance -= item.amountCents;
  }
  return balance;
}

function lineIssue(line: MonthlyCheckLine): CashMonthIssue | undefined {
  if (line.linked || line.kind === "balance_transfer" || (line.beforeStart && openingKinds.has(line.kind))) return undefined;
  return { source: "statement_line", kind: line.kind, date: line.operationDate, amount: centsToMoney(line.amountCents), reference: `${line.period}#${String(line.lineNo)}`, label: line.name, missingDocument: missingDocumentOf(line.kind) };
}

function itemIssue(item: MonthlyCheckItem): CashMonthIssue {
  return { source: "app_entry", kind: item.kind, date: item.accountingDay, amount: centsToMoney(item.amountCents), elementId: item.id, label: item.label };
}

function emptyMonth(period: string, status: CashMonthCheck["status"]): CashMonthCheck {
  return { period, status, issues: [], missingDocuments: { cashStatement: status === "missing", tradeNotices: 0, couponStatements: 0 } };
}

/** Mois du premier relevé importé au dernier mois écoulé, du plus récent au plus ancien. */
export function buildMonthlyCheck(input: MonthlyCheckInput): CashMonthCheck[] {
  const statements = [...input.statements].sort((a, b) => a.period.localeCompare(b.period));
  const first = statements[0];
  const last = statements.at(-1);
  if (!first || !last) return [];
  const byPeriod = new Map(statements.map((statement) => [statement.period, statement]));
  const end = last.period > input.lastPeriod ? last.period : input.lastPeriod;
  const months: CashMonthCheck[] = [];
  let previous: MonthlyCheckStatement | undefined;
  let previousDifference = 0;

  for (const period of periodsBetween(first.period, end)) {
    const statement = byPeriod.get(period);
    if (!statement) {
      const next = statements.find((candidate) => candidate.period > period);
      const active = input.items.some((item) => item.accountingDay.startsWith(period));
      const quiet = next !== undefined && next.openingCents === previous?.closingCents && !active;
      months.push(emptyMonth(period, quiet ? "quiet" : "missing"));
      continue;
    }
    // Opérations écrites depuis le relevé précédent : un jour sans relevé est rattaché au suivant.
    const since = previous?.period === previousPeriod(period) ? previous.closingDate : statement.openingDate;
    const lines = input.lines.filter((line) => line.period === period);
    const issues = [
      ...lines.flatMap((line) => lineIssue(line) ?? []),
      ...input.items.filter((item) => !item.absorbed && !item.linked && item.accountingDay > since && item.accountingDay <= statement.closingDate).map(itemIssue)
    ].sort((a, b) => a.date.localeCompare(b.date));
    const month: CashMonthCheck = {
      ...emptyMonth(period, "opening"),
      closingDate: statement.closingDate,
      statementBalance: centsToMoney(statement.closingCents),
      issues,
      missingDocuments: {
        cashStatement: false,
        tradeNotices: lines.filter((line) => !line.linked && missingDocumentOf(line.kind) === "trade_notice").length,
        couponStatements: lines.filter((line) => !line.certified && missingDocumentOf(line.kind) === "coupon_statement").length
      }
    };
    if (input.referenceDay === undefined || statement.closingDate >= input.referenceDay) {
      const appCents = balanceAtDay(input, statement.closingDate);
      const difference = appCents - statement.closingCents;
      month.status = difference === 0 ? "ok" : "mismatch";
      month.appBalance = centsToMoney(appCents);
      month.difference = centsToMoney(difference);
      month.monthDifference = centsToMoney(difference - previousDifference);
      previousDifference = difference;
    }
    months.push(month);
    previous = statement;
  }
  return months.reverse();
}
