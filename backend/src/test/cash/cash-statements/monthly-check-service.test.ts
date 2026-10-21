import assert from "node:assert/strict";
import test from "node:test";
import type { CashAccountCheckDto } from "@pea/shared";
import { runBackendScript } from "../../helpers/backend-script.js";
import { cashStatementScenario } from "./cash-statement-scenario.js";

interface Result { alice: CashAccountCheckDto; bob: CashAccountCheckDto; ids: Record<string, number> }

test("contrôle mensuel : soldes des relevés importés contre l'application, causes de l'écart et isolation", () => {
  const result = runBackendScript(`
    ${cashStatementScenario}
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    const { monthlyCheck } = await import("./services/cash/cash-statements/monthly-check/monthly-check.service.ts");
    const reads = () => [read("current-account-change"), read("current-mixed")];
    const preview = cashStatementsService.preview(alice, reads(), now);
    const decisions = { lines: preview.statements.flatMap((s) => s.lines)
      .filter((l) => l.case === "verify" || l.case === "create")
      .map((l) => ({ key: l.key, apply: l.key !== "2026-03#3", positionId: l.key === "2026-02#5" ? positions.asml : undefined })) };
    cashStatementsService.confirm(alice, reads(), decisions, now);
    console.log("__RESULT__" + JSON.stringify({ alice: monthlyCheck(alice, now), bob: monthlyCheck(bob, now), ids }));
  `) as Result;

  const months = new Map(result.alice.months.map((month) => [month.period, month]));
  assert.deepEqual(result.alice.months.map((month) => month.period), ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"]);
  assert.deepEqual(result.alice.counts, { ok: 1, mismatch: 1, opening: 0, quiet: 0, missing: 6 });

  const february = months.get("2026-02");
  assert.equal(february?.status, "ok", "reprise de solde neutre, versement, achats et coupon créé : le solde boucle");
  assert.deepEqual([february.statementBalance, february.appBalance, february.difference], [20.28, 20.28, 0]);

  const march = months.get("2026-03");
  assert.equal(march?.status, "mismatch");
  assert.equal(march.statementBalance, 13.06);
  // Versement de 500 € absent du relevé, achat sans avis d'opéré (3 611,30 €) et coupon non créé (4,59 €).
  assert.equal(march.difference, 4106.71);
  assert.equal(march.monthDifference, 4106.71);
  assert.deepEqual(march.issues.map((issue) => [issue.source, issue.kind, issue.amount, issue.missingDocument ?? null]), [
    ["statement_line", "dividend", 4.59, "coupon_statement"],
    ["statement_line", "buy", -3611.3, "trade_notice"],
    ["app_entry", "deposit", 500, null]
  ]);
  assert.equal(march.issues[2]?.elementId, `movement:${String(result.ids["strayDeposit"])}`);
  assert.deepEqual(march.missingDocuments, { cashStatement: false, tradeNotices: 1, couponStatements: 2 }, "coupons TotalEnergies et Air Liquide non certifiés ; remboursement certifié");
  assert.equal(months.get("2026-04")?.status, "missing");

  assert.deepEqual(result.bob.months, [], "Bob ne voit aucun relevé d'Alice");
});
