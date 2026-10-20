import { resolveColumns, totalAmounts } from "./statement-columns.js";
import { parseCouponRow, parseRefundRow, readSections } from "./statement-sections.js";
import { AMOUNT_SOURCE, StatementFormatError, amountCents, isoDate, statementPeriod, textLines, withoutAccents } from "./statement-text.js";

/** Ligne de coupon certifiable, montants en centimes. */
export interface ParsedStatementLine {
  lineNo: number;
  paymentDate: string;
  quantity?: number | undefined;
  name: string;
  isin: string;
  grossCents: number;
  withholdingCents: number;
  netFiscalCents: number;
  commissionCents: number;
  netCents: number;
}

export interface ParsedStatementRefund {
  paymentDate?: string | undefined;
  name?: string | undefined;
  isin?: string | undefined;
  amountCents: number;
}

export interface ParsedDividendStatement {
  /** Mois du relevé, `AAAA-MM`. */
  period: string;
  lines: ParsedStatementLine[];
  refunds: ParsedStatementRefund[];
  totalNetCents: number;
}

const summaryAmount = (label: string) => new RegExp(`^${label} : [A-Z ]+ (${AMOUNT_SOURCE}) EUR$`);
const couponsSummary = summaryAmount("COUPONS");
const refundsSummary = summaryAmount("REMBOURSEMENTS");

function summary(lines: readonly string[], pattern: RegExp) {
  const values = lines.map((line) => pattern.exec(withoutAccents(line).toUpperCase())?.[1]).filter((value): value is string => value !== undefined);
  const last = values.at(-1);
  return last === undefined ? undefined : amountCents(last);
}

function readPeriod(lines: readonly string[]) {
  const periods = new Set(lines.map(statementPeriod).filter((period): period is string => period !== undefined));
  if (periods.size !== 1) throw new StatementFormatError("Relevé de coupons non reconnu : mois du relevé introuvable ou incohérent.");
  const [period] = [...periods];
  if (period === undefined) throw new StatementFormatError("Relevé de coupons non reconnu : mois du relevé introuvable.");
  return period;
}

/** Tous les feuillets annoncés (« Feuillet 2/3 ») doivent être présents. */
function assertComplete(lines: readonly string[]) {
  const sheets = lines.map((line) => /^Feuillet (\d+)\/(\d+)$/.exec(line)).filter((match) => match !== null);
  const counts = new Set(sheets.map((match) => Number(match[2])));
  const seen = new Set(sheets.map((match) => Number(match[1])));
  const [count] = [...counts];
  if (counts.size !== 1 || count === undefined || seen.size !== count || ![...seen].every((sheet) => sheet >= 1 && sheet <= count)) {
    throw new StatementFormatError("Relevé incomplet : un ou plusieurs feuillets manquent.");
  }
}

function readCoupons(sections: ReturnType<typeof readSections>, netFiscalSummary: number | undefined) {
  const coupons = sections.filter((section) => section.kind === "coupons");
  const rows = coupons.flatMap((section) => section.rows).map(parseCouponRow);
  const totals = coupons.map((section) => section.total).filter((total) => total !== undefined);
  if (!rows.length) {
    if (netFiscalSummary) throw new StatementFormatError("Relevé incohérent : un total de coupons est annoncé mais aucune ligne n'est lisible.");
    return [];
  }
  if (totals.length !== 1) throw new StatementFormatError("Relevé incohérent : total des coupons manquant ou en double.");
  const [rawTotal] = totals;
  if (!rawTotal) throw new StatementFormatError("Relevé incohérent : total des coupons manquant.");
  const total = totalAmounts(rawTotal);
  if (netFiscalSummary === undefined || netFiscalSummary !== total.netFiscal) {
    throw new StatementFormatError("Relevé incohérent : le total des nets fiscaux ne correspond pas au récapitulatif.");
  }
  const amounts = resolveColumns(rows.map((row) => row.amounts), total);
  return rows.map((row, index): ParsedStatementLine => {
    const resolved = amounts[index];
    if (!resolved) throw new StatementFormatError(`Ligne ${index + 1} du relevé incohérente.`);
    return {
      lineNo: index + 1,
      paymentDate: isoDate(row.date),
      quantity: row.quantity,
      name: row.name,
      isin: row.isin,
      grossCents: resolved.gross,
      withholdingCents: resolved.credit,
      netFiscalCents: resolved.netFiscal,
      commissionCents: resolved.commission,
      netCents: resolved.net
    };
  });
}

/** Remboursements signalés ; sans ligne lisible, le récapitulatif non nul est signalé seul. */
function readRefunds(sections: ReturnType<typeof readSections>, refundsSummaryCents: number | undefined): ParsedStatementRefund[] {
  const refunds = sections.filter((section) => section.kind === "refunds").flatMap((section) => section.rows).map(parseRefundRow)
    .filter((refund): refund is NonNullable<typeof refund> => refund !== undefined && refund.amountCents > 0)
    .map((refund) => ({ paymentDate: isoDate(refund.date), name: refund.name, isin: refund.isin, amountCents: refund.amountCents }));
  if (!refunds.length && refundsSummaryCents) return [{ amountCents: refundsSummaryCents }];
  return refunds;
}

/**
 * Lit un relevé mensuel de coupons (texte extrait par `pdf-parse`). Contrôles : mois unique,
 * feuillets complets, chaque ligne lisible et cohérente, sommes égales aux totaux et au
 * récapitulatif. Le moindre écart refuse le relevé entier.
 */
export function parseDividendStatement(text: string): ParsedDividendStatement {
  const lines = textLines(text);
  const period = readPeriod(lines);
  assertComplete(lines);
  const sections = readSections(lines);
  const parsed = readCoupons(sections, summary(lines, couponsSummary));
  return {
    period,
    lines: parsed,
    refunds: readRefunds(sections, summary(lines, refundsSummary)),
    totalNetCents: parsed.reduce((sum, line) => sum + line.netCents, 0)
  };
}
