import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface SimilarResult {
  symbols: string[];
  peaEligible: Record<string, boolean>;
  empty: unknown[];
  quoteCallsForEmpty: number;
  anonymous: number[];
}

test("similar assets drop symbols Yahoo cannot quote, stay within the limit and require a session", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { featureFlagsService } = await import("./services/admin/feature-flags.service.ts");
    const { similarAssets, SIMILAR_ASSETS_LIMIT } = await import("./services/assets/similar-assets.service.ts");
    ${sessionUserHelpers}

    const admin = createUserWithSession("admin");
    featureFlagsService.update({ similar_assets: true, insights: true }, admin.id);

    const recommended = ["OR.PA", "UNKNOWN.PA", "RMS.PA", "KER.PA", "AAPL", "AI.PA", "SAN.PA", "BN.PA"];
    let quoteCalls = 0;
    yahooClient.recommendationsBySymbol = async (symbol) => symbol === "EMPTY.PA"
      ? { symbol, recommendedSymbols: [] }
      : { symbol, recommendedSymbols: recommended.map((candidate, index) => ({ symbol: candidate, score: 1 - index / 10 })) };
    yahooClient.quote = async (symbols) => {
      quoteCalls += 1;
      return symbols.filter((symbol) => symbol !== "UNKNOWN.PA").map((symbol) => ({
        symbol,
        shortName: symbol + " SA",
        regularMarketPrice: 100,
        currency: symbol === "AAPL" ? "USD" : "EUR",
        quoteType: "EQUITY",
        exchange: symbol === "AAPL" ? "NMS" : "PAR",
        fullExchangeName: symbol === "AAPL" ? "NasdaqGS" : "Paris",
        regularMarketChangePercent: 0.5
      }));
    };

    const similar = await similarAssets("MC.PA");
    const callsBeforeEmpty = quoteCalls;
    const empty = await similarAssets("EMPTY.PA");
    const quoteCallsForEmpty = quoteCalls - callsBeforeEmpty;

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      try {
        const anonymous = [];
        for (const path of ["/api/assets/MC.PA/similar", "/api/assets/MC.PA/insights", "/api/assets/MC.PA/statements"]) {
          anonymous.push((await fetch(baseUrl + path)).status);
        }
        console.log("__RESULT__" + JSON.stringify({
          symbols: similar.map((asset) => asset.symbol),
          limit: SIMILAR_ASSETS_LIMIT,
          peaEligible: Object.fromEntries(similar.map((asset) => [asset.symbol, asset.peaEligible])),
          empty,
          quoteCallsForEmpty,
          anonymous
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "false" } }) as SimilarResult & { limit: number };

  assert.equal(result.symbols.length, result.limit);
  assert.deepEqual(result.symbols, ["OR.PA", "RMS.PA", "KER.PA", "AAPL", "AI.PA", "SAN.PA"], "the unquoted symbol is dropped and the order kept");
  assert.equal(result.peaEligible["OR.PA"], true);
  assert.equal(result.peaEligible["AAPL"], false);
  assert.deepEqual(result.empty, []);
  assert.equal(result.quoteCallsForEmpty, 0, "no quote batch without recommendation");
  assert.deepEqual(result.anonymous, [401, 401, 401]);
});
