import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { cashStatementScenario } from "./cash-statement-scenario.js";

interface Snapshot { imported: boolean; checks: (string | null)[]; transactionCheck: string | null }
interface Result { before: Snapshot; afterPreview: Snapshot; alice: Snapshot; bob: Snapshot; engieBuy: string | undefined; stray: string | undefined }

test("suivi manuel : aucun contrôle par relevé tant qu'aucun relevé espèces n'est importé, propre à chaque utilisateur", () => {
  const result = runBackendScript(`
    ${cashStatementScenario}
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const snapshot = (userId, positionId) => {
      const ledger = cashAccountService.ledger(userId);
      return {
        imported: ledger.cashStatementsImported,
        checks: ledger.entries.filter((entry) => entry.kind !== "opening").map((entry) => entry.cashCheck?.status ?? null),
        transactionCheck: portfolioService.listTransactions(positionId, userId)[0]?.cashCheck?.status ?? null
      };
    };
    const reads = () => [read("current-account-change"), read("current-mixed")];
    const before = snapshot(alice, positions.engie);
    const preview = cashStatementsService.preview(alice, reads(), now);
    const afterPreview = snapshot(alice, positions.engie);
    const decisions = { lines: preview.statements.flatMap((s) => s.lines)
      .filter((l) => l.case === "verify" || l.case === "create")
      .map((l) => ({ key: l.key, apply: l.key !== "2026-03#3", positionId: l.key === "2026-02#5" ? positions.asml : undefined })) };
    cashStatementsService.confirm(alice, reads(), decisions, now);
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, 'buy', 1, 10, 0, 'EUR', '2026-02-13T09:00:00.000Z', 'manual')").run(positions.bobEngie);
    const entries = cashAccountService.ledger(alice).entries;
    const check = (id) => entries.find((entry) => entry.id === id)?.cashCheck?.status;
    console.log("__RESULT__" + JSON.stringify({
      before, afterPreview,
      alice: snapshot(alice, positions.engie),
      bob: snapshot(bob, positions.bobEngie),
      engieBuy: check("transaction:" + ids.engieBuy),
      stray: check("movement:" + ids.strayDeposit)
    }));
  `) as Result;

  assert.equal(result.before.imported, false, "sans relevé espèces, le suivi est manuel");
  assert.ok(result.before.checks.length > 0);
  assert.ok(result.before.checks.every((status) => status === null), "aucune opération saisie à la main n'est marquée « À vérifier »");
  assert.equal(result.before.transactionCheck, null, "aucun badge non plus dans les opérations d'une position");
  assert.deepEqual(result.afterPreview, result.before, "l'aperçu d'un import ne change pas le mode");

  assert.equal(result.alice.imported, true, "un relevé importé active le contrôle par relevé");
  assert.equal(result.engieBuy, "verified");
  assert.equal(result.stray, "not_found", "un versement absent d'un mois couvert reste signalé");

  assert.equal(result.bob.imported, false, "les relevés d'un autre utilisateur n'activent rien");
  assert.ok(result.bob.checks.every((status) => status === null));
  assert.equal(result.bob.transactionCheck, null);
});
