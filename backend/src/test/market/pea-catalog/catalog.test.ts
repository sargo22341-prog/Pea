import assert from "node:assert/strict";
import test from "node:test";
import { findPeaAsset, findPeaLogo, parsePeaCatalog, safeBrokerLogo } from "../../../services/assets/pea-catalog/catalog.js";
import { runBackendScript } from "../../helpers/backend-script.js";

test("broker catalogs resolve Yahoo venues and ETF types without confusing US tickers", () => {
  assert.equal(findPeaAsset("tte.pa")?.isin, "FR0000120271");
  assert.equal(findPeaAsset("WPEA.PA")?.quoteType, "ETF");
  assert.equal(findPeaAsset("TTE"), undefined);
  assert.equal(findPeaAsset("2GB.F")?.ticker, "F2GB");
  assert.equal(findPeaAsset("F2GB.F"), undefined);
  assert.match(findPeaLogo("TTE.PA") ?? "", /^https:\/\/www.boursedirect.fr\/assets\/images\/logo\/companies\//);
});

test("replacement catalogs validate their shape and exclude unresolved listings", () => {
  assert.throws(() => parsePeaCatalog({ count: 1, instruments: [] }, "ETF"));
  assert.throws(() => parsePeaCatalog({ count: 1, instruments: [{}] }, "EQUITY"));
  const item = { name: "Example", ticker: "EX", isin: "FR0000120271",
    market: { mic: "XPAR", name: "Paris" }, currency: { code: "EUR" } };
  assert.throws(() => parsePeaCatalog({ count: 1, instruments: [{ ...item, isin: "FR0000120272" }] }, "EQUITY"));
  assert.equal(parsePeaCatalog({ count: 1, instruments: [item] }, "EQUITY")[0]?.symbol, "EX.PA");
  const unnamedMarket = { ...item, market: { mic: "XPAR", name: null } };
  assert.equal(parsePeaCatalog({ count: 1, instruments: [unnamedMarket] }, "EQUITY")[0]?.exchange, "XPAR");
  for (const entry of [{ ...item, isin: undefined }, { ...item, market: { mic: "UNKNOWN", name: "Unknown" } }]) {
    assert.deepEqual(parsePeaCatalog({ count: 1, instruments: [entry] }, "EQUITY"), []);
  }
  for (const url of ["http://www.boursedirect.fr/assets/images/logo/companies/a.jpg",
    "https://evil.test/a.jpg", "https://www.boursedirect.fr/private/a.jpg"]) {
    assert.equal(safeBrokerLogo(url), undefined);
  }
});

test("local search finds ISINs and keeps user ownership checks", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { localPeaSearchService: search } = await import("./services/assets/local-pea-search.service.ts");
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('catalog', 'hash')").run();
    const results = search.search("FR0000120271", 1);
    let denied = false;
    try { search.search("FR0000120271"); } catch { denied = true; }
    console.log("__RESULT__" + JSON.stringify({ symbols: results.map(x => x.symbol), denied }));
  `) as { symbols: string[]; denied: boolean };
  assert.ok(result.symbols.includes("TTE.PA"));
  assert.ok(!result.symbols.includes("TTE"));
  assert.equal(result.denied, true);
});

test("broker logo is stored after other providers fail including a Yahoo outage", () => {
  for (const apiKey of ["", "pk_test"]) {
    const result = runBackendScript(`
      const { iconService } = await import("./services/assets/icon.service.ts");
      const { marketDataGateway } = await import("./services/market/data/market-data-gateway.service.ts");
      const { config } = await import("./config.ts");
      config.logoDevApiKey = ${JSON.stringify(apiKey)};
      marketDataGateway.fetchFreshAssetProfile = async () => { throw new Error("offline"); };
      const calls = [];
      globalThis.fetch = async (url) => {
        calls.push(String(url));
        if (!String(url).startsWith("https://www.boursedirect.fr/")) return new Response(null, { status: 404 });
        return new Response(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), { headers: { "content-type": "image/png" } });
      };
      const { runWithUser } = await import("./services/auth/user-context.ts");
      const icon = await runWithUser(1, () => iconService.fetchAndStoreIcon("TTE.PA"));
      const count = calls.length;
      await iconService.fetchAndStoreIcon("TTE.PA");
      console.log("__RESULT__" + JSON.stringify({ status: icon?.fetchStatus, calls, cached: count === calls.length }));
    `) as { status: string; calls: string[]; cached: boolean };
    assert.equal(result.status, "success");
    if (apiKey) assert.ok(result.calls[0]?.startsWith("https://img.logo.dev/"));
    assert.ok(result.calls.at(-1)?.startsWith("https://www.boursedirect.fr/"));
    assert.equal(result.cached, true);
  }
});
