import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { statementScenario } from "./statement-scenario.js";

interface Verification { verification: string | null; verification_ref: string | null; amount_cents: number; effective_at: string }
interface Failure { status: number; message: string; details?: { code?: string; outcome?: string } }

interface Result {
  manualFirst: Verification;
  certifiedOverManual: Verification;
  manualAfterCertified: Verification;
  correctionRefused: Failure;
  stillCertified: Verification;
  corrected: Verification;
  checks: Record<"otherMonth" | "amount" | "absent" | "match", { outcome: string; expected: { amount: number }; match?: { net: number }; found: unknown[] }>;
  refusals: Record<"otherMonth" | "amount" | "absent", Failure>;
  untouched: Verification;
  certifiedWithCorrection: Verification;
  otherUser: Failure;
}

test("vérification d'un dividende : le document prime, une correction retire la certification, un relevé discordant n'écrit rien", () => {
  const result = runBackendScript(`
    ${statementScenario}
    const { dividendMovementService } = await import("./services/cash/dividends/dividend-movement.service.ts");
    const { dividendStatementCheckService } = await import("./services/cash/dividend-statements/statement-single.service.ts");
    const failure = (action) => { try { action(); return { status: 0, message: "" }; } catch (error) { return { status: error.status, message: error.message, details: error.details }; } };
    const row = (id) => db.prepare("SELECT verification, verification_ref, amount_cents, effective_at FROM cash_movements WHERE id = ?").get(id);
    const april = statement("french-simple").statement;

    // Priorité du document : une vérification manuelle est remplacée, jamais l'inverse.
    const tte = movement(alice, "TTE.PA", positions.tte, 3825, "2026-03-31T09:00:00.000Z");
    dividendMovementService.verify(alice, tte, now);
    const manualFirst = row(tte);
    dividendStatementCheckService.certify(alice, tte, april, false, now);
    const certifiedOverManual = row(tte);
    dividendMovementService.verify(alice, tte, now);
    const manualAfterCertified = row(tte);

    // Corriger un dividende certifié exige une confirmation explicite, puis retire la certification.
    const correctionRefused = failure(() => dividendMovementService.correct(alice, tte, { amount: 38 }, now));
    const stillCertified = row(tte);
    dividendMovementService.correct(alice, tte, { amount: 38, confirmUncertify: true }, now);
    const corrected = row(tte);

    // Vérification d'un dividende unique : relevé d'un autre mois, montant différent, absent.
    const fdj = movement(alice, "FDJ.PA", positions.fdj, 7000, "2026-04-28T09:00:00.000Z");
    const ai = movement(alice, "AI.PA", positions.ai, 2240, "2026-05-18T09:00:00.000Z");
    const bn = movement(alice, "BN.PA", positions.bn, 840, "2026-04-20T09:00:00.000Z");
    const checks = {
      otherMonth: dividendStatementCheckService.check(alice, ai, april),
      amount: dividendStatementCheckService.check(alice, fdj, april),
      absent: dividendStatementCheckService.check(alice, bn, april),
      match: dividendStatementCheckService.check(alice, tte, april)
    };
    const refusals = {
      otherMonth: failure(() => dividendStatementCheckService.certify(alice, ai, april, false, now)),
      amount: failure(() => dividendStatementCheckService.certify(alice, fdj, april, false, now)),
      absent: failure(() => dividendStatementCheckService.certify(alice, bn, april, true, now))
    };
    const untouched = row(fdj);
    dividendStatementCheckService.certify(alice, fdj, april, true, now);
    const certifiedWithCorrection = row(fdj);

    const bob = user("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status) VALUES (?, 'ready')").run(bob);
    const otherUser = failure(() => dividendStatementCheckService.check(bob, fdj, april));

    console.log("__RESULT__" + JSON.stringify({ manualFirst, certifiedOverManual, manualAfterCertified, correctionRefused, stillCertified, corrected, checks, refusals, untouched, certifiedWithCorrection, otherUser }));
  `) as Result;

  assert.equal(result.manualFirst.verification, "manual");
  assert.deepEqual([result.certifiedOverManual.verification, result.certifiedOverManual.verification_ref], ["document", "2026-04#1"]);
  assert.equal(result.manualAfterCertified.verification, "document", "une vérification manuelle ne remplace pas une certification");

  assert.equal(result.correctionRefused.status, 409);
  assert.equal(result.correctionRefused.details?.code, "CERTIFIED_DIVIDEND");
  assert.deepEqual([result.stillCertified.verification, result.stillCertified.amount_cents], ["document", 3825]);
  assert.deepEqual([result.corrected.verification, result.corrected.amount_cents], [null, 3800]);

  assert.equal(result.checks.otherMonth.outcome, "other_month");
  assert.equal(result.checks.amount.outcome, "amount_mismatch");
  assert.deepEqual([result.checks.amount.expected.amount, result.checks.amount.match?.net], [70, 73.5]);
  assert.equal(result.checks.absent.outcome, "not_found");
  assert.equal(result.checks.match.outcome, "amount_mismatch", "le montant corrigé (38,00 €) ne correspond plus au relevé");

  assert.match(result.refusals.otherMonth.message, /autre mois/);
  assert.equal(result.refusals.amount.message, "Montant différent : 70,00 € attendus, 73,50 € sur le relevé.");
  assert.match(result.refusals.absent.message, /ne contient pas ce dividende à cette date/);
  assert.deepEqual([result.untouched.amount_cents, result.untouched.verification], [7000, null], "un avertissement n'écrit rien");
  assert.deepEqual([result.certifiedWithCorrection.amount_cents, result.certifiedWithCorrection.effective_at, result.certifiedWithCorrection.verification], [7350, "2026-04-28T12:00:00.000Z", "document"]);
  assert.equal(result.otherUser.status, 404, "le dividende d'un autre utilisateur est introuvable");
});
