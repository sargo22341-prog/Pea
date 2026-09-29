import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

interface MarketCapResult {
  byMarketCap: string[];
  largeCaps: string[];
  smallCaps: string[];
}

test("market caps published in different currencies are sorted and filtered in euros", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { screenerService } = await import("./services/screener/screener.service.ts");
    function seed(symbol, currency, marketCap) {
      db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES (?, ?, 'XX', ?, 'EQUITY')").run(symbol, symbol, currency);
      db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at) VALUES ('fundamentals', ?, ?, ?)")
        .run(symbol, JSON.stringify({ price: { marketCap } }), Math.floor(Date.now() / 1000));
    }
    // 1 770 000 Md de wons ≈ 1 150 Md € ; la devise inconnue, malgré sa valeur brute, finit dernière.
    seed("005930.KS", "KRW", 1.77e15);
    seed("UNKNOWN.XX", "XYZ", 9e15);
    seed("TTE.PA", "EUR", 140e9);
    seed("XOM", "USD", 450e9);
    seed("SMALL.PA", "EUR", 1e9);
    seed("PENCE.L", "GBp", 500e9);
    const symbols = (response) => response.rows.map((row) => row.symbol);
    console.log("__RESULT__" + JSON.stringify({
      byMarketCap: symbols(screenerService.search({ filters: {}, sort: "marketCap", direction: "desc" })),
      largeCaps: symbols(screenerService.search({ filters: { minMarketCap: 100e9 }, sort: "marketCap", direction: "desc" })),
      smallCaps: symbols(screenerService.search({ filters: { maxMarketCap: 10e9 }, sort: "marketCap", direction: "desc" }))
    }));
  `) as MarketCapResult;

  assert.deepEqual(result.byMarketCap, ["005930.KS", "XOM", "TTE.PA", "PENCE.L", "SMALL.PA", "UNKNOWN.XX"], "converted to euros, pence scaled, unknown currency last");
  assert.deepEqual(result.largeCaps, ["005930.KS", "XOM", "TTE.PA"]);
  assert.deepEqual(result.smallCaps, ["PENCE.L", "SMALL.PA"], "500 bn pence is about 5.9 bn euros");
});
