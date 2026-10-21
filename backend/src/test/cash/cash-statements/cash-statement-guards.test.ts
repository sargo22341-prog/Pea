import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { cashStatementScenario } from "./cash-statement-scenario.js";

interface Failure { status: number; code?: string; reference?: string }
interface Result {
  updateRefused: Failure;
  updateLinksAfter: number;
  updatedCheck: string | undefined;
  deleteMovementRefused: Failure;
  movementDeleted: boolean;
  correctionRefused: Failure;
  deletePositionRefused: Failure;
  uniqueIndex: string;
  checkConstraint: string;
}

test("élément vérifié : modification ou suppression refusée sans confirmation, vérification retirée avec ; unicité en base", () => {
  const result = runBackendScript(`
    ${cashStatementScenario}
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const { cashMovementsService } = await import("./services/cash/cash-movements.service.ts");
    const { dividendMovementService } = await import("./services/cash/dividends/dividend-movement.service.ts");
    const { portfolioService } = await import("./services/portfolio/portfolio.service.ts");
    const reads = [read("current-account-change"), read("current-mixed")];
    const preview = cashStatementsService.preview(alice, reads, now);
    const lines = preview.statements.flatMap((s) => s.lines).filter((l) => l.case === "verify").map((l) => ({ key: l.key, apply: true }));
    cashStatementsService.confirm(alice, reads, { lines }, now);
    const failure = (run) => { try { run(); return { status: 0 }; } catch (error) { return { status: error.status, code: error.details?.code, reference: error.details?.reference }; } };
    const linkCount = () => links().length;

    const input = { tradedAt: "2026-02-12T09:30:00.000Z", type: "buy", quantity: 37, price: 25.5, totalFees: 6.4, currency: "EUR" };
    const updateRefused = failure(() => portfolioService.updateTransaction(positions.engie, ids.engieBuy, input, alice));
    const linksBefore = linkCount();
    portfolioService.updateTransaction(positions.engie, ids.engieBuy, input, alice, undefined, { confirmUnverify: true });
    const updateLinksAfter = linksBefore - linkCount();
    const updatedCheck = cashAccountService.ledger(alice).entries.find((entry) => entry.id === "transaction:" + ids.engieBuy)?.cashCheck?.status;

    const correctionRefused = failure(() => dividendMovementService.correct(alice, ids.tteDividend, { amount: 160 }, now));
    const deleteMovementRefused = failure(() => cashMovementsService.delete(alice, ids.tteDividend));
    cashMovementsService.delete(alice, ids.tteDividend, { confirmUnverify: true });
    const movementDeleted = !db.prepare("SELECT 1 FROM cash_movements WHERE id = ?").get(ids.tteDividend);
    const deletePositionRefused = failure(() => portfolioService.deletePosition(positions.lr, alice));

    const errorOf = (run) => { try { run(); return "ok"; } catch (error) { return error.message; } };
    const lrLine = db.prepare("SELECT period, line_no FROM cash_statement_lines WHERE transaction_id = ?").get(ids.lrSell);
    const freeLine = db.prepare("SELECT period, line_no FROM cash_statement_lines WHERE user_id = ? AND transaction_id IS NULL AND movement_id IS NULL AND dividend_line_id IS NULL AND kind = 'buy'").get(alice);
    const uniqueIndex = errorOf(() => db.prepare("UPDATE cash_statement_lines SET transaction_id = ? WHERE period = ? AND line_no = ?").run(ids.lrSell, freeLine.period, freeLine.line_no));
    const checkConstraint = errorOf(() => db.prepare("UPDATE cash_statement_lines SET movement_id = ? WHERE period = ? AND line_no = ?").run(ids.strayDeposit, lrLine.period, lrLine.line_no));

    console.log("__RESULT__" + JSON.stringify({ updateRefused, updateLinksAfter, updatedCheck, deleteMovementRefused, movementDeleted, correctionRefused, deletePositionRefused, uniqueIndex, checkConstraint }));
  `) as Result;

  assert.deepEqual(result.updateRefused, { status: 409, code: "CASH_STATEMENT_VERIFIED", reference: "2026-02#3" });
  assert.equal(result.updateLinksAfter, 1, "la modification confirmée retire la vérification");
  assert.equal(result.updatedCheck, "not_found", "l'opération modifiée ne correspond plus au relevé du mois");
  assert.deepEqual(result.deleteMovementRefused, { status: 409, code: "CASH_STATEMENT_VERIFIED", reference: "2026-03#1" });
  assert.equal(result.movementDeleted, true);
  assert.equal(result.correctionRefused.code, "CASH_STATEMENT_VERIFIED");
  assert.equal(result.deletePositionRefused.code, "CASH_STATEMENT_VERIFIED");
  assert.match(result.uniqueIndex, /UNIQUE/, "un élément ne peut être rapproché que d'une seule ligne");
  assert.match(result.checkConstraint, /CHECK/, "une ligne ne peut être rapprochée que d'un seul élément");
});

interface IsolationResult {
  bobTargets: string[];
  aliceIds: string[];
  bobForeignTarget: { verified: number; unmatched: number };
  bobLinks: { transaction_id: number | null; movement_id: number | null }[];
  repositoryLink: boolean;
  ambiguous: { case: string; candidates: string[] };
  chosen: { verified: number };
  chosenLink: number | null;
  bobDeposits: number[];
  refund: { cashCase: string; couponCase: string; couponResult: { created: number; certified: number }; repayments: number };
}

test("isolation entre utilisateurs, ambiguïté tranchée par l'utilisateur, remboursement lu sur les deux documents sans doublon", () => {
  const result = runBackendScript(`
    ${cashStatementScenario}
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    const { cashStatementsRepository } = await import("./repositories/cash/cash-statements.repository.ts");
    const { dividendStatementsService } = await import("./services/cash/dividend-statements/statement-import.service.ts");
    const { parseDividendStatement } = await import("./services/cash/dividend-statements/parser/statement-parser.ts");
    const all = (preview) => preview.statements.flatMap((s) => s.lines);

    // Bob : un second versement identique rend la ligne de versement ambiguë.
    const bobSecond = movement(bob, "deposit", 200000, "2026-02-13T08:00:00.000Z");
    const bobPreview = cashStatementsService.preview(bob, [read("current-account-change"), read("current-mixed")], now);
    const bobTargets = all(bobPreview).flatMap((l) => [l.target?.id, ...(l.candidates ?? []).map((c) => c.id)]).filter(Boolean);
    const aliceIds = [...Object.entries(ids).filter(([name]) => !name.startsWith("bob")).map(([name, id]) => (name.endsWith("Buy") || name.endsWith("Sell") ? "transaction:" : "movement:") + id)];
    const bobForeignTarget = cashStatementsService.confirm(bob, [read("current-mixed")], { lines: [{ key: "2026-03#5", apply: true, targetId: "transaction:" + ids.lrSell }] }, now);
    const repositoryLink = cashStatementsRepository.link(bob, "2026-03", 5, { transactionId: ids.lrSell }, now.toISOString());
    const ambiguousLine = all(bobPreview).find((l) => l.key === "2026-02#2");
    const chosen = cashStatementsService.confirm(bob, [read("current-account-change")], { lines: [{ key: "2026-02#2", apply: true, targetId: "movement:" + bobSecond }] }, now);

    // Alice : remboursement de décembre 2025 créé par le relevé espèces, puis lu sur le relevé de coupons.
    const cashPreview = cashStatementsService.preview(alice, [read("legacy-mixed")], now);
    const refundLine = all(cashPreview).find((l) => l.kind === "capital_repayment");
    cashStatementsService.confirm(alice, [read("legacy-mixed")], { lines: [{ key: refundLine.key, apply: true }] }, now);
    const coupon = { fileName: "coupons.pdf", statement: parseDividendStatement([
      "COUPONS REMBOURSEMENTS : DECEMBRE 2025", "DETAIL REMBOURSEMENTS", "08/12/2025 ENGIE (FR0010208488) 0,625 98 61,25 61,25",
      "TOTAL EUR 61,25 0,00 61,25", "COUPONS : NETS FISCAUX 0,00 EUR", "REMBOURSEMENTS : BRUTS GLOBAUX 61,25 EUR", "Feuillet 1/1"
    ].join("\\n")) };
    const couponPreview = dividendStatementsService.preview(alice, [coupon], now);
    const couponResult = dividendStatementsService.confirm(alice, [coupon], { lines: [{ key: "2025-12#R1", apply: true }], certifyOpening: false }, now);

    console.log("__RESULT__" + JSON.stringify({
      bobTargets, aliceIds, bobForeignTarget,
      bobLinks: db.prepare("SELECT transaction_id, movement_id FROM cash_statement_lines WHERE user_id = ? AND (transaction_id IS NOT NULL OR movement_id IS NOT NULL)").all(bob),
      repositoryLink,
      ambiguous: { case: ambiguousLine.case, candidates: ambiguousLine.candidates.map((c) => c.id) },
      bobDeposits: [ids.bobDeposit, bobSecond],
      chosen, chosenLink: db.prepare("SELECT movement_id FROM cash_statement_lines WHERE user_id = ? AND period = '2026-02' AND line_no = 2").get(bob).movement_id,
      refund: {
        cashCase: refundLine.case, couponCase: couponPreview.statements[0].refunds[0].case, couponResult,
        repayments: db.prepare("SELECT COUNT(*) AS n FROM cash_movements WHERE user_id = ? AND type = 'capital_repayment' AND amount_cents = 6125").get(alice).n
      }
    }));
  `) as IsolationResult;

  for (const id of result.bobTargets) assert.ok(!result.aliceIds.includes(id), `Bob ne voit pas ${id}`);
  assert.equal(result.bobForeignTarget.verified, 0, "Bob ne peut pas rapprocher une opération d'Alice");
  assert.equal(result.repositoryLink, false, "l'appartenance est revérifiée en SQL");
  assert.deepEqual(result.ambiguous, { case: "ambiguous", candidates: result.bobDeposits.map((id) => `movement:${String(id)}`) });
  assert.equal(result.chosenLink, result.bobDeposits[1], "seul l'élément choisi par l'utilisateur est rapproché");
  assert.equal(result.chosen.verified, 1);
  assert.equal(result.bobLinks.length, 1);
  assert.equal(result.refund.cashCase, "create");
  assert.equal(result.refund.couponCase, "certify", "le relevé de coupons reconnaît le remboursement créé par le relevé espèces");
  assert.equal(result.refund.couponResult.created, 0);
  assert.equal(result.refund.repayments, 1, "un seul remboursement, quel que soit l'ordre des imports");
});
