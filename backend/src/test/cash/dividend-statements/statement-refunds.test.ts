import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { parseDividendStatement } from "../../../services/cash/dividend-statements/parser/statement-parser.js";
import { StatementFormatError } from "../../../services/cash/dividend-statements/parser/statement-text.js";
import { statementScenario } from "./statement-scenario.js";

/** Relevé sans coupon, avec un remboursement Danone (ISIN connu du scénario) de 51,04 €. */
const refundLines = (row = "05/05/2026 DANONE (FR0000120644) 0,319 160 51,04 51,04", total = "TOTAL EUR 51,04 0,00 51,04", summary = "REMBOURSEMENTS : BRUTS GLOBAUX 51,04 EUR") => [
  "COUPONS REMBOURSEMENTS : MAI 2026", "DETAIL REMBOURSEMENTS", row, total, "COUPONS : NETS FISCAUX 0,00 EUR", summary, "Feuillet 1/1"
];

test("remboursements : ligne contrôlée (unitaire × quantité, commission), relevé refusé s'il est incohérent", () => {
  const withCommission = parseDividendStatement(refundLines("05/05/2026 DANONE (FR0000120644) 0,319 160 51,04 1,00 50,04", "TOTAL EUR 51,04 1,00 50,04").join("\n"));
  assert.deepEqual(withCommission.refunds, [{ lineNo: 1, paymentDate: "2026-05-05", name: "DANONE", isin: "FR0000120644", quantity: 160, grossCents: 5104, amountCents: 5004 }]);
  assert.throws(() => parseDividendStatement(refundLines("05/05/2026 DANONE (FR0000120644) 0,319 161 51,04 51,04").join("\n")), StatementFormatError, "unitaire × quantité ≠ brut");
  assert.throws(() => parseDividendStatement(refundLines(undefined, "TOTAL EUR 51,04 0,00 51,03").join("\n")), /total des remboursements/);
  assert.throws(() => parseDividendStatement(refundLines(undefined, undefined, "REMBOURSEMENTS : BRUTS GLOBAUX 52,04 EUR").join("\n")), /total des remboursements/);
  assert.throws(() => parseDividendStatement(refundLines("05/05/2026 DANONE (FR0000120644) 51,04").join("\n")), StatementFormatError, "ligne illisible");
});

interface Refund { key: string; case: string; beforeStart: boolean; position?: { symbol: string }; movement?: { id: number }; candidates?: { id: number }[]; possibleDuplicate?: boolean }
interface Movement { id: number; user_id: number; type: string; amount_cents: number; position_id: number | null; source: string; import_ref: string | null; note: string | null; verification: string | null; verification_ref: string | null }
interface Result {
  created: { preview: Refund; result: { created: number; refunds: number }; movements: Movement[]; summary: { cash: number; deposits: number; cashDividends: number; otherCredits: number } };
  reimport: { preview: Refund; result: { alreadyCertified: number; created: number }; count: number };
  opening: { preview: Refund; movements: Movement[]; cash: number };
  manual: { preview: Refund; result: { certified: number; created: number }; movements: Movement[] };
  ambiguous: { preview: Refund; skipped: { skipped: number }; chosen: { certified: number }; movements: Movement[]; foreign: { skipped: number }; bobMovements: number };
}

test("remboursements : créés une seule fois, rapprochés d'une saisie, ambiguïté tranchée par l'utilisateur", () => {
  const result = runBackendScript(`
    ${statementScenario}
    const { dividendStatementsService } = await import("./services/cash/dividend-statements/statement-import.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const refundRead = () => inlineStatement("mai-2026.pdf", ${JSON.stringify(refundLines())});
    const credits = (userId) => db.prepare("SELECT id, user_id, type, amount_cents, position_id, source, import_ref, note, verification, verification_ref FROM cash_movements WHERE user_id = ? AND type = 'capital_repayment' ORDER BY id").all(userId);
    const run = (userId, reads, decision = { apply: true }) => {
      const preview = dividendStatementsService.preview(userId, reads, now);
      const refunds = preview.statements.flatMap((row) => row.refunds);
      const result = dividendStatementsService.confirm(userId, reads, { lines: refunds.map((refund) => ({ key: refund.key, ...decision })), certifyOpening: false }, now);
      return { preview: refunds[0], result };
    };
    const manual = (userId, cents, effectiveAt) => db.prepare("INSERT INTO cash_movements (user_id, type, amount_cents, effective_at, source) VALUES (?, 'capital_repayment', ?, ?, 'manual')").run(userId, cents, effectiveAt);
    const reset = () => db.prepare("DELETE FROM cash_movements WHERE type = 'capital_repayment'").run();

    const created = run(alice, [refundRead()]);
    const createdOut = { ...created, movements: credits(alice), summary: cashAccountService.summary(alice) };
    // Réimport, et même contenu sous un autre nom dans le lot : rien n'est créé.
    const again = run(alice, [refundRead(), { ...refundRead(), fileName: "copie.pdf" }]);
    const reimport = { ...again, count: credits(alice).length };

    // Remboursement antérieur à l'état initial (relevé de mai 2024, ISIN absent du portefeuille).
    reset();
    const old = run(alice, [statement("foreign-multiple")]);
    const opening = { preview: old.preview, movements: credits(alice), cash: cashAccountService.summary(alice).cash };

    // Saisi à la main huit jours plus tard, sans actif : rapproché, jamais dupliqué.
    reset();
    manual(alice, 5104, "2026-05-13T09:00:00.000Z");
    const linked = run(alice, [refundRead()]);
    const manualOut = { ...linked, movements: credits(alice) };

    // Deux saisies identiques : l'utilisateur choisit, rien n'est choisi à sa place.
    reset();
    manual(alice, 5104, "2026-05-05T09:00:00.000Z");
    manual(alice, 5104, "2026-05-06T09:00:00.000Z");
    const preview = dividendStatementsService.preview(alice, [refundRead()], now).statements[0].refunds[0];
    const skipped = run(alice, [refundRead()]).result;
    const bob = user("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready')").run(bob);
    manual(bob, 5104, "2026-05-05T09:00:00.000Z");
    const bobCandidate = credits(bob)[0].id;
    // Un mouvement d'un autre utilisateur n'est jamais un candidat.
    const foreign = run(alice, [refundRead()], { apply: true, movementId: bobCandidate }).result;
    const chosen = run(alice, [refundRead()], { apply: true, movementId: preview.candidates[1].id }).result;
    const ambiguous = { preview, skipped, chosen, movements: credits(alice), foreign, bobMovements: credits(bob).filter((row) => row.verification !== null).length };

    console.log("__RESULT__" + JSON.stringify({ created: createdOut, reimport, opening, manual: manualOut, ambiguous }));
  `) as Result;

  const { created } = result;
  assert.deepEqual([created.preview.case, created.preview.key, created.preview.beforeStart, created.preview.position?.symbol], ["create", "2026-05#R1", false, "BN.PA"]);
  assert.deepEqual([created.result.created, created.result.refunds], [1, 1]);
  const [movement] = created.movements;
  assert.equal(created.movements.length, 1);
  assert.deepEqual([movement?.amount_cents, movement?.source, movement?.import_ref, movement?.verification, movement?.verification_ref], [5104, "pdf", "statement:2026-05#R1", "document", "2026-05#R1"]);
  // 100 € initiaux + 51,04 : un crédit, ni versement ni dividende.
  assert.deepEqual([created.summary.cash, created.summary.deposits, created.summary.cashDividends, created.summary.otherCredits], [151.04, 100, 0, 51.04]);

  assert.equal(result.reimport.preview.case, "already_certified");
  assert.deepEqual([result.reimport.result.created, result.reimport.result.alreadyCertified, result.reimport.count], [0, 1, 1], "réimport : aucune création");

  assert.deepEqual([result.opening.preview.case, result.opening.preview.beforeStart, result.opening.preview.position], ["create", true, undefined]);
  assert.deepEqual(result.opening.movements.map((row) => [row.amount_cents, row.position_id, row.note]), [[6313, null, "ENGIE (FR0010208488)"]]);
  assert.equal(result.opening.cash, 100, "résumé par l'état initial : le solde ne change pas");

  assert.equal(result.manual.preview.case, "certify");
  assert.deepEqual([result.manual.result.certified, result.manual.result.created], [1, 0]);
  assert.deepEqual(result.manual.movements.map((row) => [row.source, row.verification, row.verification_ref]), [["manual", "document", "2026-05#R1"]]);

  const { ambiguous } = result;
  assert.equal(ambiguous.preview.case, "ambiguous");
  assert.equal(ambiguous.preview.candidates?.length, 2);
  assert.equal(ambiguous.skipped.skipped, 1, "sans choix, rien n'est rapproché");
  assert.equal(ambiguous.foreign.skipped, 1);
  assert.equal(ambiguous.bobMovements, 0, "le mouvement d'un autre utilisateur n'est jamais certifié");
  assert.equal(ambiguous.chosen.certified, 1);
  assert.deepEqual(ambiguous.movements.map((row) => row.verification_ref), [null, "2026-05#R1"], "seul le mouvement choisi est certifié, aucun n'est créé");
});
