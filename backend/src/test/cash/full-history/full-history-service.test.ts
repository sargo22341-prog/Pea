import assert from "node:assert/strict";
import test from "node:test";
import type { CashLedgerDto, FullHistoryPreview } from "@pea/shared";
import { runBackendScript } from "../../helpers/backend-script.js";
import { fullHistoryScenario } from "./full-history-scenario.js";

interface Result {
  preview: FullHistoryPreview;
  bobPreview: FullHistoryPreview;
  xirrBefore: number | null;
  ledger: CashLedgerDto;
  xirrAfter: number | null;
  rows: { movements: { type: string; amount_cents: number; effective_at: string; source: string; symbol: string | null; import_ref: string | null; verification: string | null; verification_ref: string | null }[]; dividendLines: number; unlinkedLines: number; bobDividendLines: number };
  account: { reference_at: string | null; opening_dividends_cents: number | null; full_history_reference_at: string | null; opened_at: string | null };
  revision: { fullHistory?: { createdMovements: number; convertedDividends: number }; referenceAt?: string };
  again: { status: number; code?: string };
  reimport: { cases: string[]; added: number };
  couponReimport: string;
  proposals: string[];
}

test("historique complet : conversion atomique de l'état initial, indicateurs justes, aucun doublon au réimport", () => {
  const result = runBackendScript(`
    ${fullHistoryScenario}
    const { fullHistoryService } = await import("./services/cash/full-history/full-history.service.ts");
    const { peaOverview } = await import("./services/cash/pea-overview.ts");
    const { loadStatementContext } = await import("./services/cash/dividend-statements/statement-context.ts");
    const { classifyLine } = await import("./services/cash/dividend-statements/statement-reconciliation.ts");
    const { syncDividendProposals } = await import("./services/cash/dividends/dividend-proposals-sync.ts");
    const { dividendsRepository } = await import("./repositories/market/dividends.repository.ts");
    importStatements(alice);
    const preview = fullHistoryService.preview(alice);
    const bobPreview = fullHistoryService.preview(bob);
    const xirrBefore = peaOverview(alice, 300, 250, now).annualizedReturnPercent ?? null;
    const ledger = fullHistoryService.complete(alice, now);
    const xirrAfter = peaOverview(alice, 300, 250, now).annualizedReturnPercent ?? null;
    const rows = {
      movements: db.prepare("SELECT type, amount_cents, effective_at, source, symbol, import_ref, verification, verification_ref FROM cash_movements WHERE user_id = ? ORDER BY effective_at").all(alice),
      dividendLines: db.prepare("SELECT COUNT(*) AS n FROM cash_dividend_statement_lines WHERE user_id = ?").get(alice).n,
      unlinkedLines: db.prepare("SELECT COUNT(*) AS n FROM cash_statement_lines WHERE user_id = ? AND transaction_id IS NULL AND movement_id IS NULL AND dividend_line_id IS NULL").get(alice).n,
      bobDividendLines: db.prepare("SELECT COUNT(*) AS n FROM cash_dividend_statement_lines WHERE user_id = ?").get(bob).n
    };
    const account = db.prepare("SELECT reference_at, opening_dividends_cents, full_history_reference_at, opened_at FROM cash_accounts WHERE user_id = ?").get(alice);
    const revision = JSON.parse(db.prepare("SELECT next_json FROM cash_account_revisions WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(alice).next_json);
    let again = { status: 0 };
    try { fullHistoryService.complete(alice, now); } catch (error) { again = { status: error.status, code: error.details?.code }; }

    const before = count();
    const reimportPreview = cashStatementsService.preview(alice, reads(), now);
    importStatements(alice);
    const reimport = { cases: reimportPreview.statements.flatMap((s) => s.lines.map((l) => l.case)), added: count() - before };
    const couponLine = { lineNo: 1, paymentDate: "2021-08-06", isin: "FR0010208488", name: "ENGIE", grossCents: 170, withholdingCents: 0, netFiscalCents: 170, commissionCents: 0, netCents: 170 };
    const couponReimport = classifyLine(loadStatementContext(alice, now), "2021-08", couponLine).case;

    db.prepare("INSERT INTO assets (symbol, name, currency) VALUES ('ENGI.PA', 'Engie', 'EUR')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'ENGI.PA'").get().id;
    dividendsRepository.upsert(assetId, { date: "2021-08-20T07:00:00.000Z", amount: 0.5, currency: "EUR" });
    dividendsRepository.upsert(assetId, { date: "2026-05-04T07:00:00.000Z", amount: 0.7, currency: "EUR" });
    syncDividendProposals(alice, now);
    const proposals = db.prepare("SELECT ex_date FROM cash_dividend_proposals WHERE user_id = ? ORDER BY ex_date").all(alice).map((row) => row.ex_date);
    console.log("__RESULT__" + JSON.stringify({ preview, bobPreview, xirrBefore, ledger, xirrAfter, rows, account, revision, again, reimport, couponReimport, proposals }));
  `) as Result;

  const { preview } = result;
  assert.equal(preview.eligible, true, JSON.stringify(preview.blockers));
  assert.deepEqual([preview.firstPeriod, preview.lastPeriod, preview.statements], ["2021-07", "2021-08", 2]);
  assert.deepEqual(preview.creations, [{ kind: "deposit", count: 2, amount: 400 }], "les virements réels remplacent les versements déclarés");
  assert.deepEqual(preview.dividends, { count: 1, amount: 1.7 });
  assert.deepEqual(preview.before, { cash: 1226.25, deposits: 1400, withdrawals: 0, cashDividends: 1.7, otherCredits: 0 });
  assert.deepEqual(preview.after, preview.before, "aucun double comptage : mêmes indicateurs, désormais justifiés opération par opération");
  assert.equal(preview.negativeBalanceAt, undefined);
  assert.deepEqual(result.bobPreview.blockers.map((blocker) => blocker.code), ["no_statements"], "Bob ne voit pas les relevés d'Alice");
  assert.equal(result.xirrBefore, null, "XIRR non calculable avec un état initial");

  const { summary, settings, entries } = result.ledger;
  assert.deepEqual([summary.cash, summary.deposits, summary.cashDividends, summary.remainingCeiling], [1226.25, 1400, 1.7, 148_600]);
  assert.equal(summary.historyIncomplete, false);
  assert.equal(settings.referenceAt, undefined);
  assert.equal(settings.fullHistoryAt, "2026-10-20T12:00:00.000Z");
  assert.equal(settings.openedAt, "2021-07-05T22:00:00.000Z", "date d'ouverture : jour du virement de création, à Paris");
  assert.ok(entries.every((entry) => entry.kind !== "opening" && !entry.absorbed && !entry.id.startsWith("statement-line:")));
  assert.ok(entries.filter((entry) => entry.effectiveAt < "2021-09-01").every((entry) => entry.cashCheck?.status === "verified"), "chaque opération de 2021 est vérifiée par relevé espèces");
  assert.equal(typeof result.xirrAfter, "number", "le rendement annualisé devient calculable");

  const dividend = result.rows.movements.find((movement) => movement.type === "dividend");
  assert.deepEqual(dividend, { type: "dividend", amount_cents: 170, effective_at: "2021-08-06T12:00:00.000Z", source: "pdf", symbol: "ENGI.PA", import_ref: "statement:2021-08#1", verification: "document", verification_ref: "2021-08#1" });
  assert.deepEqual(result.rows.movements.filter((movement) => movement.type === "deposit").map((movement) => [movement.effective_at, movement.amount_cents, Boolean(movement.import_ref?.startsWith("cash-statement:"))]), [
    ["2021-07-05T22:00:00.000Z", 30000, true],
    ["2021-08-19T22:00:00.000Z", 10000, true],
    ["2026-09-01T08:00:00.000Z", 100000, false]
  ]);
  assert.deepEqual([result.rows.dividendLines, result.rows.unlinkedLines, result.rows.bobDividendLines], [0, 0, 1], "la ligne de coupons devient un mouvement ; celle de Bob est intacte");
  assert.deepEqual(result.account, { reference_at: null, opening_dividends_cents: null, full_history_reference_at: "2021-08-31T20:00:00.000Z", opened_at: "2021-07-05T22:00:00.000Z" });
  assert.deepEqual(result.revision.fullHistory, { createdMovements: 2, convertedDividends: 1 }, "passage tracé dans les révisions");
  assert.deepEqual(result.again, { status: 409, code: "FULL_HISTORY_INELIGIBLE" }, "un second passage est refusé");

  assert.ok(result.reimport.cases.every((value) => value === "already_verified"), result.reimport.cases.join());
  assert.equal(result.reimport.added, 0, "réimport des relevés espèces : aucune création");
  assert.equal(result.couponReimport, "already_certified", "réimport du relevé de coupons : le dividende converti est déjà certifié");
  assert.deepEqual(result.proposals, ["2026-05-04"], "aucun dividende d'avant l'ancienne date de départ n'est proposé à nouveau");
});

test("historique complet : un mois qui ne boucle plus après conversion annule tout", () => {
  const result = runBackendScript(`
    ${fullHistoryScenario}
    const { fullHistoryService } = await import("./services/cash/full-history/full-history.service.ts");
    importStatements(alice);
    // Relevés falsifiés mais continus : juillet finit (et août commence) à 124,56 € au lieu de 124,55 €.
    db.prepare("UPDATE cash_statements SET closing_cents = 12456 WHERE user_id = ? AND period = '2021-07'").run(alice);
    db.prepare("UPDATE cash_statements SET opening_cents = 12456, closing_cents = 22626 WHERE user_id = ? AND period = '2021-08'").run(alice);
    const before = count();
    let error = {};
    try { fullHistoryService.complete(alice, now); } catch (caught) { error = { status: caught.status, code: caught.details?.code, periods: caught.details?.periods }; }
    const account = db.prepare("SELECT reference_at, full_history_at FROM cash_accounts WHERE user_id = ?").get(alice);
    const dividendLines = db.prepare("SELECT COUNT(*) AS n FROM cash_dividend_statement_lines WHERE user_id = ?").get(alice).n;
    console.log("__RESULT__" + JSON.stringify({ error, account, added: count() - before, dividendLines }));
  `) as { error: { status: number; code: string; periods: string[] }; account: { reference_at: string | null; full_history_at: string | null }; added: number; dividendLines: number };

  assert.deepEqual(result.error, { status: 409, code: "FULL_HISTORY_MISMATCH", periods: ["2021-08", "2021-07"] });
  assert.deepEqual(result.account, { reference_at: "2021-08-31T20:00:00.000Z", full_history_at: null }, "l'état initial est conservé");
  assert.equal(result.added, 0, "aucun mouvement créé");
  assert.equal(result.dividendLines, 1);
});
