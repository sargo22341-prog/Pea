import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface PdfImportResult {
  shortfall: { status: number; details: Record<string, unknown> };
  transactionsAfterShortfall: number;
  funded: { imported: string[]; skipped: string[]; errors: unknown[] };
  cashAfterFunded: { cash: number; deposits: number };
  reimport: { imported: string[]; skipped: string[] };
  transactionsAfterReimport: number;
}

test("un import d'avis rejoue ventes et achats dans l'ordre, se finance explicitement et refuse les doublons", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { marketDataGateway } = await import("./services/market/data/market-data-gateway.service.ts");
    ${helpers}
    ${sessionUserHelpers}
    yahooApi.quote = async (symbol) => pricedQuoteRow(symbol, "CLOSED", 100);
    yahooApi.quoteBatchRaw = async (symbols) => symbols.map((symbol) => pricedQuoteRow(symbol, "CLOSED", 100));
    yahooApi.chart = async () => ({ quotes: [], dividends: [], splits: [] });
    yahooApi.quoteSummary = async () => ({ profile: {}, raw: {} });
    marketDataGateway.readQuoteWithCache = async (symbol) => ({ data: { symbol } });

    const alice = createUserWithSession("alice");
    const row = (reference, sens, symbol, quantite, cours, date) => ({
      id: reference, reference, dateExecution: date, nomValeur: symbol, quantite, sensOperation: sens, coursExecute: cours,
      montantTotalFrais: 0, devise: "EUR", warnings: [], selectedSymbol: symbol, selectedAssetName: symbol, action: "import"
    });
    // L'achat de 2 345 titres est financé par la vente du même lot, exécutée plus tôt dans la journée.
    const rows = [
      row("000000000002", "achat", "BBB.PA", 2345, 4.21, "2026-03-16T15:00:00"),
      row("000000000001", "achat", "AAA.PA", 10, 500, "2026-03-15T10:00:00"),
      row("000000000003", "vente", "AAA.PA", 10, 512.34, "2026-03-16T14:05:10")
    ];
    const transactions = () => db.prepare("SELECT COUNT(*) AS total FROM transactions").get().total;

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const confirm = async (body) => {
        const response = await fetch(baseUrl + "/api/import/avis-operes/confirm", { method: "POST", headers: { "Content-Type": "application/json", Cookie: alice.cookie }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
      };
      try {
        const shortfall = await confirm({ rows });
        const transactionsAfterShortfall = transactions();
        const funded = await confirm({ rows, funding: { amount: shortfall.body.details.shortfall } });
        const cashAfterFunded = (await (await fetch(baseUrl + "/api/cash", { headers: { Cookie: alice.cookie } })).json()).summary;
        const reimport = await confirm({ rows });
        const transactionsAfterReimport = transactions();
        console.log("__RESULT__" + JSON.stringify({
          shortfall: { status: shortfall.status, details: shortfall.body.details },
          transactionsAfterShortfall, funded: funded.body, cashAfterFunded,
          reimport: reimport.body, transactionsAfterReimport
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as PdfImportResult;

  assert.equal(result.shortfall.status, 422);
  // Dates des avis en heure de Paris (fuseau de l'application, UTC+1 en mars). Achat AAA 5 000 € le 15/03 sans espèces ; la vente du 16/03 (5 123,40 €) finance l'achat BBB (9 872,45 €).
  assert.deepEqual(result.shortfall.details, { code: "INSUFFICIENT_FUNDS", available: 0, required: 14_872.45, shortfall: 9_749.05, effectiveAt: "2026-03-15T09:00:00.000Z", fundable: true });
  assert.equal(result.transactionsAfterShortfall, 0, "un import refusé n'écrit aucune ligne");
  assert.deepEqual(result.funded.imported, ["AAA.PA", "AAA.PA", "BBB.PA"], "lignes rejouées dans l'ordre chronologique");
  assert.deepEqual(result.funded.errors, []);
  assert.deepEqual(result.cashAfterFunded, { ...result.cashAfterFunded, cash: 0, deposits: 9_749.05 });
  assert.deepEqual(result.reimport.imported, []);
  assert.equal(result.reimport.skipped.length, 3, "un avis déjà importé est ignoré");
  assert.equal(result.transactionsAfterReimport, 3);
});
