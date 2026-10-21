import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

interface Outcome { imported: string[]; skipped: string[]; linked: string[]; errors: { line: number; message: string }[] }
interface TradeRow { symbol: string; type: string; quantity: number; price: number; traded_at: string; import_ref: string | null; isin: string | null }
interface ReimportResult {
  first: Outcome;
  afterFirst: TradeRow[];
  second: Outcome;
  afterSecond: TradeRow[];
  bob: Outcome;
  bobTrades: TradeRow[];
}

test("réimporter des avis complète les opérations existantes et ne crée jamais de doublon", () => {
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
    const bob = createUserWithSession("bob");
    // Opérations importées avant l'enregistrement de la référence d'ordre : sans import_ref ni ISIN.
    const legacy = (userId, symbol, type, quantity, price, tradedAt) => {
      let position = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol);
      if (!position) {
        db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, 0, 0, 'EUR')").run(userId, symbol, symbol);
        position = db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol);
      }
      db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source) VALUES (?, ?, ?, ?, 0, 'EUR', ?, 'pdf_avis_opere')").run(position.id, type, quantity, price, tradedAt);
    };
    legacy(alice.id, "BN.PA", "buy", 2, 60.1, "2026-09-15T08:33:37.000Z");
    legacy(alice.id, "GLE.PA", "buy", 5, 30, "2026-08-03T07:00:00.000Z");
    legacy(alice.id, "AI.PA", "buy", 1, 170, "2026-09-01T07:00:00.000Z");
    legacy(alice.id, "AI.PA", "buy", 1, 170, "2026-09-01T11:00:00.000Z");
    legacy(bob.id, "OR.PA", "buy", 1, 400, "2026-01-05T09:00:00.000Z");

    const row = (reference, symbol, sens, quantite, cours, date, extra = {}) => ({
      id: reference || symbol + date, reference, dateExecution: date, nomValeur: symbol, isin: symbol === "BN.PA" ? "FR0000120644" : undefined,
      quantite, sensOperation: sens, coursExecute: cours, montantTotalFrais: 0, devise: "EUR", warnings: [],
      selectedSymbol: symbol, selectedAssetName: symbol, action: "import", ...extra
    });
    const rows = [
      row("111", "BN.PA", "achat", 2, 60.1, "2026-09-15T10:33:37"),
      row("111", "BN.PA", "achat", 2, 60.1, "2026-09-15T10:33:37"),
      row(undefined, "BN.PA", "achat", 1, 59, "2026-09-20T10:00:00"),
      row(undefined, "BN.PA", "achat", 1, 59, "2026-09-20T10:00:00"),
      row("333", "BN.PA", "achat", 2, 60.1, "2026-09-15T15:00:00"),
      row("444", "GLE.PA", "achat", 5, 30, "2026-08-03T09:00:00", { action: "ignore" }),
      row(undefined, "AI.PA", "achat", 1, 170, "2026-09-01T17:00:00"),
      row("666", "AI.PA", "achat", 1, 170, "2026-09-01T09:00:00", { confirmDuplicate: true })
    ];
    const trades = (userId) => db.prepare("SELECT p.symbol, t.type, t.quantity, t.price, t.traded_at, t.import_ref, t.isin FROM transactions t JOIN positions p ON p.id = t.position_id WHERE p.user_id = ? ORDER BY p.symbol, t.traded_at, t.id").all(userId);

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const confirm = async (user, body) => (await fetch(baseUrl + "/api/import/avis-operes/confirm", { method: "POST", headers: { "Content-Type": "application/json", Cookie: user.cookie }, body: JSON.stringify(body) })).json();
      try {
        const first = await confirm(alice, { rows });
        const afterFirst = trades(alice.id);
        const second = await confirm(alice, { rows });
        const afterSecond = trades(alice.id);
        const bobResult = await confirm(bob, { rows: [rows[0]] });
        console.log("__RESULT__" + JSON.stringify({ first, afterFirst, second, afterSecond, bob: bobResult, bobTrades: trades(bob.id) }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false", TZ: "Europe/Paris" } }) as ReimportResult;

  const ambiguous = "Plusieurs operations identiques sont deja enregistrees : rien n'est cree ni modifie.";
  assert.deepEqual(result.first.errors, [{ line: 7, message: ambiguous }], "deux candidates sans instant commun : rien n'est choisi en silence");
  assert.deepEqual(result.first.imported.sort(), ["AI.PA", "BN.PA", "BN.PA"], "seules l'opération nouvelle, l'ordre distinct et le doublon confirmé sont créés");
  assert.deepEqual(result.first.linked.sort(), ["BN.PA", "BN.PA", "GLE.PA"]);
  assert.deepEqual(result.first.skipped, ["BN.PA (deja importe)"], "le même avis deux fois dans le lot n'est lu qu'une fois");

  const bn = result.afterFirst.filter((trade) => trade.symbol === "BN.PA");
  assert.deepEqual(bn.map((trade) => [trade.traded_at, trade.import_ref, trade.isin]), [
    ["2026-09-15T08:33:37.000Z", "pdf:111", "FR0000120644"],
    ["2026-09-15T13:00:00.000Z", "pdf:333", "FR0000120644"],
    ["2026-09-20T08:00:00.000Z", null, "FR0000120644"]
  ], "l'opération existante reçoit la référence et l'ISIN ; la copie sans référence n'est pas recréée");
  assert.equal(result.afterFirst.find((trade) => trade.symbol === "GLE.PA")?.import_ref, "pdf:444", "une ligne décochée complète l'opération retrouvée");
  assert.equal(result.afterFirst.filter((trade) => trade.symbol === "AI.PA").length, 3);

  assert.deepEqual(result.second.imported, [], "réimporter le lot ne crée rien");
  assert.deepEqual(result.afterSecond, result.afterFirst);

  assert.deepEqual(result.bob.imported, ["BN.PA"], "les opérations d'un autre utilisateur ne sont jamais rapprochées");
  assert.equal(result.bobTrades.filter((trade) => trade.symbol === "BN.PA").length, 1);
  assert.equal(result.afterSecond.find((trade) => trade.symbol === "BN.PA")?.import_ref, "pdf:111");
});

test("un avis est rattaché à la position qui porte son ISIN, même sous un autre nom, sans recherche Yahoo", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { resolveAssetFromOperation } = await import("./services/boursorama/avis-asset-resolution.ts");
    const { marketDataGateway } = await import("./services/market/data/market-data-gateway.service.ts");
    ${sessionUserHelpers}
    let searches = 0;
    marketDataGateway.search = async () => { searches += 1; return { data: [] }; };
    const alice = createUserWithSession("alice");
    const bob = createUserWithSession("bob");
    db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, 'CW8.PA', 'Amundi MSCI World', 1, 500, 'EUR')").run(alice.id);
    db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at, source, isin) VALUES (1, 'buy', 1, 500, 0, 'EUR', '2026-01-05T09:00:00.000Z', 'pdf_avis_opere', 'LU1681043599')").run();
    const operation = { id: "x", nomValeur: "AM.M.WOR.ETF EUR C", isin: "LU1681043599", sensOperation: "achat", devise: "EUR", warnings: [] };
    const forAlice = await runWithUser(alice.id, () => resolveAssetFromOperation(operation));
    const forBob = await runWithUser(bob.id, () => resolveAssetFromOperation(operation));
    console.log("__RESULT__" + JSON.stringify({ alice: forAlice.selectedSymbol ?? null, bob: forBob.selectedSymbol ?? null, searches }));
  `) as { alice: string | null; bob: string | null; searches: number };

  assert.equal(result.alice, "CW8.PA");
  assert.equal(result.bob, null, "la position d'un autre utilisateur n'est jamais proposée");
  assert.equal(result.searches, 2, "seul l'utilisateur sans position interroge la recherche (ISIN puis nom)");
});
