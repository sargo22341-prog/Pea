import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { statementScenario } from "./statement-scenario.js";

interface Entry { id: string; kind: string; effectiveAt: string; amount: number; balanceAfter: number; absorbed: boolean; source: string; symbol?: string; name?: string; positionId?: number; isin?: string; verification?: { status: string; reference?: string } }
interface Ledger { summary: { cashDividends: number } & Record<string, unknown>; entries: Entry[] }

interface Result {
  positions: { bn: number; fdj: number };
  ledger: Ledger;
  withoutLines: { ledger: Ledger; overview: Record<string, unknown> };
  overview: Record<string, unknown>;
  storedLines: number;
  movements: number;
  restoredNames: (string | null)[];
  bobLines: number;
  afterEarlierReference: string[];
}

const isStatementLine = (entry: Entry) => entry.id.startsWith("statement-line:");

test("dividendes d'avant l'état initial certifiés par relevé : affichés dans le journal sans aucun effet sur le solde ni les indicateurs", () => {
  const result = runBackendScript(`
    ${statementScenario}
    const { dividendStatementsService } = await import("./services/cash/dividend-statements/statement-import.service.ts");
    const { cashAccountService } = await import("./services/cash/cash-account.service.ts");
    const { peaOverview } = await import("./services/cash/pea-overview.ts");
    // Un dividende après l'état initial : il reste le seul compté en plus des dividendes déjà perçus.
    movement(alice, "TTE.PA", positions.tte, 3825, "2026-03-31T09:00:00.000Z");
    const reads = () => [statement("foreign-multiple")];
    dividendStatementsService.confirm(alice, reads(), { lines: [], certifyOpening: true }, now);
    const ledger = cashAccountService.ledger(alice);
    const overview = peaOverview(alice, 1000, 900, now);

    // Lignes importées avant la migration 54 : sans nom, complété par le réimport, sans doublon.
    db.prepare("UPDATE cash_dividend_statement_lines SET name = NULL WHERE user_id = ?").run(alice);
    dividendStatementsService.confirm(alice, reads(), { lines: [], certifyOpening: true }, now);
    const storedLines = db.prepare("SELECT COUNT(*) AS total FROM cash_dividend_statement_lines WHERE user_id = ?").get(alice).total;
    const restoredNames = db.prepare("SELECT name FROM cash_dividend_statement_lines WHERE user_id = ? ORDER BY period, line_no").all(alice).map((row) => row.name);
    const movements = db.prepare("SELECT COUNT(*) AS total FROM cash_movements WHERE user_id = ?").get(alice).total;

    const bob = user("bob");
    db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at) VALUES (?, 'ready', '2026-03-01T00:00:00.000Z')").run(bob);
    const bobLines = cashAccountService.ledger(bob).entries.filter((entry) => entry.id.startsWith("statement-line:")).length;

    // Date de départ avancée au 2 mai 2024 : seules les lignes d'avril 2024 restent antérieures.
    db.prepare("UPDATE cash_accounts SET reference_at = '2024-05-02T00:00:00.000Z' WHERE user_id = ?").run(alice);
    const afterEarlierReference = cashAccountService.ledger(alice).entries.filter((entry) => entry.id.startsWith("statement-line:")).map((entry) => entry.effectiveAt);
    db.prepare("UPDATE cash_accounts SET reference_at = '2026-03-01T00:00:00.000Z' WHERE user_id = ?").run(alice);

    // Même compte sans les lignes de relevé : le journal et les indicateurs doivent être identiques.
    db.prepare("DELETE FROM cash_dividend_statement_lines WHERE user_id = ?").run(alice);
    const withoutLines = { ledger: cashAccountService.ledger(alice), overview: peaOverview(alice, 1000, 900, now) };

    console.log("__RESULT__" + JSON.stringify({ positions, ledger, withoutLines, overview, storedLines, movements, restoredNames, bobLines, afterEarlierReference }));
  `) as Result;

  const lines = result.ledger.entries.filter(isStatementLine);
  assert.equal(lines.length, 7, "chaque ligne du relevé de mai 2024 est affichée");
  for (const line of lines) {
    assert.deepEqual([line.kind, line.absorbed, line.source, line.verification?.status], ["dividend", true, "statement", "document"]);
    assert.match(line.verification?.reference ?? "", /^2024-05#\d+$/);
  }
  const byIsin = (isin: string) => lines.find((line) => line.isin === isin);
  assert.deepEqual([byIsin("FR0000120644")?.symbol, byIsin("FR0000120644")?.positionId], ["BN.PA", result.positions.bn], "rattachée par l'ISIN de la position");
  assert.equal(byIsin("FR0013451333")?.positionId, result.positions.fdj, "ou par l'ISIN des avis d'opéré");
  assert.deepEqual([byIsin("FR0010208488")?.symbol, byIsin("FR0010208488")?.positionId, byIsin("FR0010208488")?.name], [undefined, undefined, "ENGIE"], "sans position : ISIN et nom du relevé");
  assert.equal(byIsin("FR0000124141")?.positionId, undefined, "jamais de rapprochement par nom");
  assert.deepEqual([byIsin("FR0000120644")?.amount, byIsin("FR0000120644")?.effectiveAt], [8.4, "2024-05-03T12:00:00.000Z"]);

  // Aucun effet : solde après de chaque entrée, solde, versements, plafond, dividendes, gain global, XIRR.
  const others = result.ledger.entries.filter((entry) => !isStatementLine(entry));
  assert.deepEqual(others, result.withoutLines.ledger.entries, "les autres lignes du journal sont inchangées");
  assert.deepEqual(result.ledger.summary, result.withoutLines.ledger.summary);
  assert.deepEqual(result.overview, result.withoutLines.overview);
  assert.equal(result.ledger.summary.cashDividends, 300.92, "262,67 € déjà perçus + 38,25 € après l'état initial, jamais deux fois");
  const chronological = [...result.ledger.entries].reverse();
  for (const [index, entry] of chronological.entries()) {
    if (isStatementLine(entry)) assert.equal(entry.balanceAfter, chronological[index - 1]?.balanceAfter ?? 0, "une ligne de relevé ne modifie pas le solde");
  }

  assert.equal(result.storedLines, 7, "le réimport ne crée aucun doublon");
  assert.equal(result.movements, 1, "une ligne d'avant l'état initial n'est jamais un mouvement espèces");
  assert.ok(result.restoredNames.every((name) => typeof name === "string" && name.length > 0), "le réimport complète le nom");
  assert.equal(result.bobLines, 0, "un autre utilisateur ne voit rien");
  assert.deepEqual(result.afterEarlierReference, ["2024-04-26T12:00:00.000Z", "2024-04-22T12:00:00.000Z"], "les lignes devenues postérieures à la date de départ sont masquées");
});
