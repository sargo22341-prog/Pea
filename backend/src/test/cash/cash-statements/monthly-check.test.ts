import assert from "node:assert/strict";
import test from "node:test";
import { balanceAtDay, buildMonthlyCheck, type MonthlyCheckInput, type MonthlyCheckItem, type MonthlyCheckLine, type MonthlyCheckStatement } from "../../../services/cash/cash-statements/monthly-check/monthly-check.js";
import { periodsBetween } from "../../../services/cash/cash-statements/monthly-check/month-periods.js";

const statement = (period: string, openingDate: string, closingDate: string, openingCents: number, closingCents: number): MonthlyCheckStatement => ({ period, openingDate, closingDate, openingCents, closingCents });
const item = (id: string, kind: MonthlyCheckItem["kind"], accountingDay: string, amountCents: number, extra: Partial<MonthlyCheckItem> = {}): MonthlyCheckItem => ({ id, kind, accountingDay, amountCents, absorbed: false, linked: true, ...extra });
const line = (period: string, lineNo: number, kind: MonthlyCheckLine["kind"], operationDate: string, amountCents: number, extra: Partial<MonthlyCheckLine> = {}): MonthlyCheckLine => ({ period, lineNo, kind, operationDate, amountCents, linked: true, certified: false, beforeStart: false, ...extra });
const input = (extra: Partial<MonthlyCheckInput>): MonthlyCheckInput => ({ openingCashCents: 0, items: [], statements: [], lines: [], lastPeriod: "2026-04", ...extra });
const byPeriod = (months: ReturnType<typeof buildMonthlyCheck>) => new Map(months.map((month) => [month.period, month]));

test("périodes : passage d'année et plage inclusive", () => {
  assert.deepEqual(periodsBetween("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(periodsBetween("2026-02", "2026-01"), []);
});

test("un achat exécuté en fin de mois compte à sa date d'écriture : le mois reste juste", () => {
  const months = byPeriod(buildMonthlyCheck(input({
    statements: [statement("2026-03", "2026-02-28", "2026-03-31", 0, 100_000), statement("2026-04", "2026-03-31", "2026-04-30", 100_000, 40_000)],
    // Exécuté le 31/03, écrit le 02/04 : le relevé de mars ne le contient pas.
    items: [item("movement:1", "deposit", "2026-03-10", 100_000), item("transaction:1", "buy", "2026-04-02", -60_000)],
    lines: [line("2026-03", 1, "deposit", "2026-03-10", 100_000), line("2026-04", 1, "buy", "2026-04-02", -60_000)]
  })));
  assert.equal(months.get("2026-03")?.status, "ok");
  assert.equal(months.get("2026-03")?.appBalance, 1000);
  assert.equal(months.get("2026-04")?.status, "ok");
  assert.equal(months.get("2026-04")?.appBalance, 400);
});

test("écart : lignes sans opération, opération absente du relevé, écart du mois et documents manquants", () => {
  const months = buildMonthlyCheck(input({
    statements: [statement("2026-03", "2026-02-28", "2026-03-31", 0, 50_000), statement("2026-04", "2026-03-31", "2026-04-30", 50_000, 45_459)],
    items: [
      item("movement:1", "deposit", "2026-03-02", 50_000),
      item("movement:2", "deposit", "2026-03-20", 20_000, { linked: false, label: undefined }),
      item("movement:3", "dividend", "2026-04-05", 4_000, { label: "TTE.PA" })
    ],
    lines: [
      line("2026-03", 1, "deposit", "2026-03-02", 50_000),
      line("2026-04", 1, "dividend", "2026-04-05", 4_000),
      line("2026-04", 2, "dividend", "2026-04-06", 459, { linked: false, name: "AIR LIQUIDE" }),
      line("2026-04", 3, "buy", "2026-04-08", -9_000, { linked: false, name: "LEGRAND" })
    ]
  }));
  const [april, march] = months;
  assert.equal(march?.status, "mismatch");
  assert.equal(march.difference, 200, "versement de 200 € absent du relevé");
  assert.deepEqual(march.issues.map((issue) => [issue.source, issue.elementId ?? issue.reference, issue.amount]), [["app_entry", "movement:2", 200]]);
  assert.equal(april?.status, "mismatch");
  // Application : 500 + 200 + 40 = 740 ; relevé : 454,59 → 285,41 dont 85,41 apparus en avril.
  assert.equal(april.difference, 285.41);
  assert.equal(april.monthDifference, 85.41);
  assert.deepEqual(april.issues.map((issue) => [issue.reference, issue.missingDocument, issue.label]), [["2026-04#2", "coupon_statement", "AIR LIQUIDE"], ["2026-04#3", "trade_notice", "LEGRAND"]]);
  assert.deepEqual(april.missingDocuments, { cashStatement: false, tradeNotices: 1, couponStatements: 2 }, "un coupon rapproché mais non certifié manque aussi");
});

test("état initial : mois antérieurs non comparés, opération résumée mais écrite après la date de départ", () => {
  const base = {
    referenceDay: "2026-03-31",
    openingCashCents: 10_000,
    statements: [statement("2026-03", "2026-02-28", "2026-03-31", 0, 40_000), statement("2026-04", "2026-03-31", "2026-04-30", 40_000, 10_000)],
    // Achat exécuté le 31/03 (résumé par l'état initial), écrit le 01/04 par le courtier.
    items: [item("transaction:1", "buy", "2026-04-01", -30_000, { absorbed: true })],
    lines: [line("2026-03", 1, "deposit", "2026-03-02", 40_000, { linked: false, beforeStart: true }), line("2026-04", 1, "buy", "2026-04-01", -30_000)]
  };
  const months = byPeriod(buildMonthlyCheck(input(base)));
  assert.equal(months.get("2026-03")?.status, "ok", "le mois de la date de départ est comparé");
  assert.equal(months.get("2026-03")?.appBalance, 400, "l'achat écrit en avril est retiré du solde déclaré");
  assert.deepEqual(months.get("2026-03")?.issues, [], "un versement antérieur à la date de départ n'est pas une cause");
  assert.equal(months.get("2026-04")?.status, "ok");
  assert.equal(balanceAtDay(base, "2026-04-30"), 10_000);

  const later = byPeriod(buildMonthlyCheck(input({ ...base, referenceDay: "2026-04-15" })));
  assert.equal(later.get("2026-03")?.status, "opening");
  assert.equal(later.get("2026-03")?.appBalance, undefined);
});

test("mois sans relevé : sans opération et solde qui se suit, sinon manquant, jusqu'au dernier mois écoulé", () => {
  const january = statement("2026-01", "2025-12-31", "2026-01-31", 0, 1_000);
  const statements = [january, statement("2026-03", "2026-02-28", "2026-03-31", 1_000, 1_000)];
  const deposit = item("movement:1", "deposit", "2026-01-05", 1_000);
  const quiet = byPeriod(buildMonthlyCheck(input({ statements, items: [deposit], lastPeriod: "2026-04" })));
  assert.equal(quiet.get("2026-02")?.status, "quiet");
  assert.equal(quiet.get("2026-04")?.status, "missing", "mois écoulé après le dernier relevé");
  assert.equal(quiet.get("2026-04")?.missingDocuments.cashStatement, true);
  assert.equal(quiet.size, 4);

  const active = byPeriod(buildMonthlyCheck(input({ statements, items: [deposit, item("transaction:1", "buy", "2026-02-10", -500, { linked: false })] })));
  assert.equal(active.get("2026-02")?.status, "missing", "une opération du mois exige son relevé");
  const broken = byPeriod(buildMonthlyCheck(input({ statements: [january, statement("2026-03", "2026-02-28", "2026-03-31", 900, 900)] })));
  assert.equal(broken.get("2026-02")?.status, "missing", "le solde ne se suit pas");
  assert.deepEqual(buildMonthlyCheck(input({})), [], "aucun relevé importé");
});
