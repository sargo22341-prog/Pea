import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { cashStatementScenario } from "./cash-statement-scenario.js";

interface Line { key: string; case: string; beforeStart: boolean; target?: { id: string } }
interface Statement { period?: string; error?: string; alreadyImported?: boolean; continuity?: { status: string; missingPeriods?: string[]; balanceMatches?: boolean }; lines: Line[] }
interface ImportResult { statements: number; verified: number; created: number; alreadyVerified: number; unmatched: number; errors: { lineNo?: number; message: string }[] }
interface Link { key: string; transaction_id: number | null; movement_id: number | null; dividend_line_id: number | null }
interface Created { type: string; amount_cents: number; effective_at: string; source: string; import_ref: string; position_id: number | null; note: string | null }
interface Check { status: string; reference?: string }

interface Result {
  ids: Record<string, number>;
  cases: Record<string, string>;
  continuity: Record<string, Statement["continuity"]>;
  writesAfterPreview: number;
  first: ImportResult;
  links: Link[];
  created: Created[];
  checks: Record<string, Check | undefined>;
  transactionCheck: Check | undefined;
  createdSource: string | undefined;
  summary: { deposits: number; otherCredits: number; cashDividends: number; remainingCeiling: number; netDeposits: number };
  second: ImportResult;
  countDelta: number;
  reimportCases: Record<string, string>;
  reimportFlags: (boolean | undefined)[];
  rejected: { duplicate: Statement; otherContent: Statement };
}

test("relevés espèces : chaque cas de rapprochement, création vérifiée, alertes et réimport sans création", () => {
  const result = runBackendScript(`
    ${cashStatementScenario}
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const reads = () => [read("current-account-change"), read("current-mixed")];
    const caseMap = (preview) => Object.fromEntries(preview.statements.flatMap((s) => s.lines.map((l) => [l.key, l.case])));
    const before = count();
    const preview = cashStatementsService.preview(alice, reads(), now);
    const writesAfterPreview = count() - before + db.prepare("SELECT COUNT(*) AS n FROM cash_statement_lines").get().n;
    const decisions = { lines: preview.statements.flatMap((s) => s.lines)
      .filter((l) => l.case === "verify" || l.case === "create")
      .map((l) => ({ key: l.key, apply: l.key !== "2026-03#3", positionId: l.key === "2026-02#5" ? positions.asml : undefined })) };
    const first = cashStatementsService.confirm(alice, reads(), decisions, now);
    const afterFirst = count();
    const ledger = cashAccountService.ledger(alice);
    const check = (id) => ledger.entries.find((entry) => entry.id === id)?.cashCheck;
    const second = cashStatementsService.confirm(alice, reads(), decisions, now);
    const reimport = cashStatementsService.preview(alice, reads(), now);
    const mixedAgain = read("current-mixed");
    const changed = { fileName: "autre.pdf", statement: { ...mixedAgain.statement, fingerprint: "autre-contenu" } };
    const rejectedPreview = cashStatementsService.preview(alice, [read("current-mixed"), read("current-mixed")], now);
    const otherContent = cashStatementsService.preview(alice, [changed], now).statements[0];

    console.log("__RESULT__" + JSON.stringify({
      ids,
      cases: caseMap(preview),
      continuity: Object.fromEntries(preview.statements.map((s) => [s.period, s.continuity])),
      writesAfterPreview, first,
      links: links(),
      created: db.prepare("SELECT type, amount_cents, effective_at, source, import_ref, position_id, note FROM cash_movements WHERE user_id = ? AND import_ref LIKE 'cash-statement:%' ORDER BY id").all(alice),
      checks: { engieBuy: check("transaction:" + ids.engieBuy), stray: check("movement:" + ids.strayDeposit), refund: check("movement:" + ids.engieRefund), febDeposit: check("movement:" + ids.febDeposit) },
      transactionCheck: portfolioService.listTransactions(positions.lr, alice)[0].cashCheck,
      createdSource: ledger.entries.find((entry) => entry.importRef === "cash-statement:2026-03#6")?.source,
      summary: ledger.summary,
      second, countDelta: count() - afterFirst,
      reimportCases: caseMap(reimport),
      reimportFlags: reimport.statements.map((s) => s.alreadyImported),
      rejected: { duplicate: rejectedPreview.statements[1], otherContent }
    }));
  `) as Result;

  assert.deepEqual(result.cases, {
    "2026-02#1": "neutral", "2026-02#2": "verify", "2026-02#3": "verify", "2026-02#4": "verify", "2026-02#5": "create",
    "2026-03#1": "verify", "2026-03#2": "verify", "2026-03#3": "create", "2026-03#4": "create", "2026-03#5": "verify", "2026-03#6": "create", "2026-03#7": "missing_trade"
  });
  assert.deepEqual(result.continuity["2026-02"], { status: "first" });
  assert.equal(result.continuity["2026-03"]?.status, "continuous");
  assert.equal(result.writesAfterPreview, 0, "l'aperçu n'écrit rien");

  assert.deepEqual(result.first, { statements: 2, verified: 6, created: 3, alreadyVerified: 0, unmatched: 2, errors: [] });
  const linked = Object.fromEntries(result.links.map((row) => [row.key, row.transaction_id ? `transaction:${String(row.transaction_id)}` : `movement:${String(row.movement_id)}`]));
  assert.equal(linked["2026-02#2"], `movement:${String(result.ids["febDeposit"])}`);
  assert.equal(linked["2026-02#3"], `transaction:${String(result.ids["engieBuy"])}`);
  assert.equal(linked["2026-02#4"], `transaction:${String(result.ids["ishsBuy"])}`);
  assert.equal(linked["2026-03#1"], `movement:${String(result.ids["tteDividend"])}`);
  assert.equal(linked["2026-03#2"], `movement:${String(result.ids["engieRefund"])}`, "remboursement déjà certifié par le relevé de coupons : vérifié, pas recréé");
  assert.equal(linked["2026-03#5"], `transaction:${String(result.ids["lrSell"])}`);
  assert.equal(linked["2026-03#3"], undefined, "coupon décoché : rien n'est créé");
  assert.equal(linked["2026-03#7"], undefined, "achat sans avis d'opéré : rien n'est créé");

  assert.deepEqual(result.created.map((row) => [row.type, row.amount_cents, row.source, row.import_ref]), [
    ["dividend", 272, "pdf", "cash-statement:2026-02#5"],
    ["compensation", 7099, "pdf", "cash-statement:2026-03#4"],
    ["deposit", 200_000, "pdf", "cash-statement:2026-03#6"]
  ]);
  assert.equal(result.created[0]?.effective_at, "2026-02-18T12:00:00.000Z", "un coupon créé est daté de son échéance");
  assert.equal(result.created[1]?.note, "AIR LIQUIDE");
  assert.equal(result.created[2]?.effective_at, "2026-03-16T23:00:00.000Z", "un versement créé précède les achats du jour (minuit à Paris)");

  assert.deepEqual(result.checks["engieBuy"], { status: "verified", reference: "2026-02#3", verifiedAt: "2026-10-20T12:00:00.000Z" });
  assert.equal(result.checks["stray"]?.status, "not_found", "un versement absent d'un mois couvert est signalé");
  assert.equal(result.checks["refund"]?.status, "verified");
  assert.equal(result.transactionCheck?.status, "verified", "badge aussi dans les opérations d'une position");
  assert.equal(result.createdSource, "cash_statement", "un versement créé est affiché avec l'origine « Relevé espèces »");

  // Indicateurs : versements (manuels + créé), autres crédits hors versements et dividendes.
  assert.equal(result.summary.deposits, 4525.06);
  assert.equal(result.summary.netDeposits, 4525.06);
  assert.equal(result.summary.remainingCeiling, 150_000 - 4525.06);
  assert.equal(result.summary.otherCredits, 122.03);
  assert.equal(result.summary.cashDividends, 167.68);

  assert.equal(result.second.created, 0, "réimport : aucune création");
  assert.equal(result.second.statements, 0);
  assert.equal(result.second.alreadyVerified, 9);
  assert.equal(result.countDelta, 0);
  assert.equal(result.reimportCases["2026-02#3"], "already_verified");
  assert.deepEqual(result.reimportFlags, [true, true]);
  assert.match(result.rejected.duplicate.error ?? "", /en double dans le lot/);
  assert.match(result.rejected.otherContent.error ?? "", /contenu différent/);
});
