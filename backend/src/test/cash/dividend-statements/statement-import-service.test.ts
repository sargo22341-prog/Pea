import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { statementScenario } from "./statement-scenario.js";

interface Movement { id: number; symbol: string; amount_cents: number; effective_at: string; source: string; verification: string | null; verification_ref: string | null; import_ref: string | null }
interface LinePreview { key: string; case: string; movement?: { id: number }; proposalId?: number; possibleDuplicate?: boolean }
interface ImportResult { certified: number; corrected: number; created: number; alreadyCertified: number; skipped: number; openingCertified: boolean; errors: { message: string }[] }

interface Result {
  preview: { april: LinePreview[]; may: LinePreview[]; old: LinePreview[]; opening: { certifiable: number; declared?: number } };
  writesAfterPreview: number;
  first: ImportResult;
  movements: Movement[];
  proposalStatus: string;
  vieIsin: string;
  account: { opening_dividends_cents: number; opening_dividends_certified_at: string | null };
  openingLines: number;
  summary: { cash: number; deposits: number; remainingCeiling: number };
  second: ImportResult;
  movementsAfterReimport: number;
  reimportPreview: string[];
  pendingAccount: { status: number; message: string };
}

test("relevés de coupons : chaque cas de rapprochement, dividendes déjà perçus et réimport sans effet", () => {
  const result = runBackendScript(`
    ${statementScenario}
    const { dividendStatementsService } = await import("./services/cash/dividend-statements/statement-import.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    // Cas 1 : TotalEnergies déjà saisi au bon montant ; cas 2 : FDJ saisi avec un autre montant et une autre date.
    const tte = movement(alice, "TTE.PA", positions.tte, 3825, "2026-03-31T09:00:00.000Z");
    const fdj = movement(alice, "FDJ.PA", positions.fdj, 7000, "2026-04-27T09:00:00.000Z");
    const count = () => db.prepare("SELECT (SELECT COUNT(*) FROM cash_movements) + (SELECT COUNT(*) FROM cash_dividend_statement_lines) + (SELECT COUNT(*) FROM cash_movements WHERE verification IS NOT NULL) AS total").get().total;
    const reads = () => [statement("french-simple"), mayStatement(), statement("foreign-multiple")];
    const before = count();
    const preview = dividendStatementsService.preview(alice, reads(), now);
    const writesAfterPreview = count() - before;
    const byPeriod = (period) => preview.statements.find((row) => row.period === period).lines;
    const decisions = (positionId) => ({
      lines: [...byPeriod("2026-04"), ...byPeriod("2026-05")].map((line) => ({ key: line.key, apply: true, positionId: line.case === "unknown_asset" ? positionId : undefined })),
      certifyOpening: true
    });
    const first = dividendStatementsService.confirm(alice, reads(), decisions(positions.vie), now);
    const movements = dividends();
    const second = dividendStatementsService.confirm(alice, reads(), decisions(positions.vie), now);
    const reimport = dividendStatementsService.preview(alice, reads(), now);

    const bob = user("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'pending')").run(bob);
    let pendingAccount = { status: 0, message: "" };
    try { dividendStatementsService.preview(bob, reads(), now); } catch (error) { pendingAccount = { status: error.status, message: error.message }; }

    console.log("__RESULT__" + JSON.stringify({
      preview: { april: byPeriod("2026-04"), may: byPeriod("2026-05"), old: byPeriod("2024-05"), opening: preview.opening },
      writesAfterPreview, first, movements,
      proposalStatus: db.prepare("SELECT status FROM cash_dividend_proposals WHERE symbol = 'AI.PA'").get().status,
      vieIsin: db.prepare("SELECT isin FROM positions WHERE id = ?").get(positions.vie).isin,
      account: db.prepare("SELECT opening_dividends_cents, opening_dividends_certified_at FROM cash_accounts WHERE user_id = ?").get(alice),
      openingLines: db.prepare("SELECT COUNT(*) AS total FROM cash_dividend_statement_lines WHERE user_id = ?").get(alice).total,
      summary: cashAccountService.summary(alice),
      second, movementsAfterReimport: dividends().length,
      reimportPreview: reimport.statements.flatMap((row) => row.lines.map((line) => line.case)),
      pendingAccount
    }));
  `) as Result;

  assert.equal(result.writesAfterPreview, 0, "l'aperçu n'écrit rien");
  assert.deepEqual(result.preview.april.map((line) => line.case), ["certify", "mismatch"]);
  assert.deepEqual(result.preview.may.map((line) => line.case), ["create", "unknown_asset", "proposal"]);
  assert.ok(result.preview.old.every((line) => line.case === "opening"), "un crédit antérieur à l'état initial n'est jamais crédité");
  assert.deepEqual(result.preview.opening, { referenceAt: "2026-03-01T00:00:00.000Z", certifiable: 262.67 });

  assert.deepEqual(result.first, { certified: 2, corrected: 1, created: 2, alreadyCertified: 0, skipped: 0, openingCertified: true, errors: [] });
  const bySymbol = (symbol: string) => result.movements.find((row) => row.symbol === symbol);
  assert.deepEqual([bySymbol("TTE.PA")?.verification, bySymbol("TTE.PA")?.verification_ref], ["document", "2026-04#1"]);
  assert.deepEqual([bySymbol("FDJ.PA")?.amount_cents, bySymbol("FDJ.PA")?.effective_at, bySymbol("FDJ.PA")?.verification], [7350, "2026-04-28T12:00:00.000Z", "document"]);
  assert.deepEqual([bySymbol("BN.PA")?.source, bySymbol("BN.PA")?.import_ref, bySymbol("BN.PA")?.verification], ["pdf", "statement:2026-05#1", "document"]);
  assert.deepEqual([bySymbol("VIE.PA")?.amount_cents, bySymbol("VIE.PA")?.verification_ref], [4500, "2026-05#2"]);
  assert.deepEqual([bySymbol("AI.PA")?.amount_cents, bySymbol("AI.PA")?.verification], [2240, "document"]);
  assert.equal(result.proposalStatus, "accepted", "la proposition ignorée est validée avec le net du relevé");
  assert.equal(result.vieIsin, "FR0000124141", "l'ISIN est enregistré sur la position choisie");
  assert.equal(result.movements.length, 5, "aucun mouvement pour les lignes antérieures à l'état initial");
  assert.equal(result.account.opening_dividends_cents, 26_267);
  assert.ok(result.account.opening_dividends_certified_at);
  assert.equal(result.openingLines, 7);
  // 100 € initiaux + dividendes (38,25 + 73,50 + 8,40 + 45,00 + 22,40) : jamais des versements.
  assert.deepEqual([result.summary.cash, result.summary.deposits, result.summary.remainingCeiling], [287.55, 100, 149_900]);

  // Les 7 lignes antérieures à l'état initial sont aussi déjà certifiées.
  assert.deepEqual(result.second, { certified: 0, corrected: 0, created: 0, alreadyCertified: 12, skipped: 0, openingCertified: false, errors: [] });
  assert.equal(result.movementsAfterReimport, 5, "réimporter le même relevé ne crée rien");
  assert.ok(result.reimportPreview.every((value) => value === "already_certified"));
  assert.equal(result.pendingAccount.status, 409, "un compte espèces non configuré est refusé");
  assert.match(result.pendingAccount.message, /Configurez d'abord le compte especes/);
});
