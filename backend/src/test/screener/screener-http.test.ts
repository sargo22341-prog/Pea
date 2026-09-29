import assert from "node:assert/strict";
import test from "node:test";
import type { ScreenerPreset, ScreenerResponse } from "@pea/shared";
import { runBackendScript } from "../helpers/backend-script.js";
import { sessionUserHelpers } from "../helpers/session-users.js";

interface ScreenerHttpResult {
  all: ScreenerResponse;
  yieldAndPer: ScreenerResponse;
  peaOnly: ScreenerResponse;
  etfs: ScreenerResponse;
  nearHigh: ScreenerResponse;
  hostile: ScreenerResponse;
  assetsAfterHostile: number;
  options: { sectors: string[]; countries: string[] };
  invalidStatuses: number[];
  presets: { created: number; ownerList: ScreenerPreset[]; otherList: ScreenerPreset[]; otherDelete: number; invalidBody: number; ownerDelete: number; afterDelete: number };
  anonymousStatus: number;
}

const seedHelpers = `
  function seed({ symbol, name, quoteType, exchange, currency, sector, country, price, high, divYield, pe, marketCap }) {
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency, quote_type) VALUES (?, ?, ?, ?, ?)").run(symbol, name, exchange, currency, quoteType);
    const id = db.prepare("SELECT id FROM assets WHERE symbol = ?").get(symbol).id;
    db.prepare("INSERT INTO asset_quote_snapshot (asset_id, last_price, currency, exchange, quote_type) VALUES (?, ?, ?, ?, ?)").run(id, price, currency, exchange, quoteType);
    if (high) db.prepare("INSERT INTO asset_quote_range (asset_id, fifty_two_week_high) VALUES (?, ?)").run(id, high);
    if (divYield !== undefined) db.prepare("INSERT INTO asset_dividend_snapshot (asset_id, dividend_yield) VALUES (?, ?)").run(id, divYield);
    if (sector || country) db.prepare("INSERT INTO asset_profiles (asset_id, sector, country) VALUES (?, ?, ?)").run(id, sector ?? null, country ?? null);
    const payload = { summaryDetail: { trailingPE: pe }, price: { marketCap } };
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at) VALUES ('fundamentals', ?, ?, ?)").run(symbol, JSON.stringify(payload), Math.floor(Date.now() / 1000));
  }
`;

test("screener filters the known assets locally, keeps PEA eligibility in one place and isolates saved presets", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    ${sessionUserHelpers}
    ${seedHelpers}
    seed({ symbol: "TTE.PA", name: "TotalEnergies", quoteType: "EQUITY", exchange: "PAR", currency: "EUR", sector: "Energy", country: "France", price: 60, high: 70, divYield: 0.052, pe: 8, marketCap: 140e9 });
    seed({ symbol: "ENGI.PA", name: "Engie", quoteType: "EQUITY", exchange: "PAR", currency: "EUR", sector: "Utilities", country: "France", price: 15, high: 15.5, divYield: 0.08, pe: -3, marketCap: 35e9 });
    seed({ symbol: "XOM", name: "Exxon Mobil", quoteType: "EQUITY", exchange: "NYQ", currency: "USD", sector: "Energy", country: "United States", price: 110, high: 120, divYield: 0.035, pe: 13, marketCap: 450e9 });
    seed({ symbol: "CW8.PA", name: "Amundi MSCI World UCITS ETF", quoteType: "ETF", exchange: "PAR", currency: "EUR", price: 500, high: 510, pe: 22 });
    seed({ symbol: "^FCHI", name: "CAC 40", quoteType: "INDEX", exchange: "PAR", currency: "EUR", price: 8000, pe: 15 });

    const owner = createUserWithSession("owner");
    const other = createUserWithSession("other");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const call = (path, init = {}, cookie = owner.cookie) => fetch(baseUrl + path, {
        ...init,
        headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", Origin: baseUrl }
      });
      const json = async (path, cookie) => (await call(path, {}, cookie)).json();
      try {
        const hostile = await json("/api/screener?sector=" + encodeURIComponent("Energy'; DROP TABLE assets; --"));
        const invalid = [
          "/api/screener?minDividendYield=2",
          "/api/screener?maxTrailingPE=-1",
          "/api/screener?minTrailingPE=20&maxTrailingPE=10",
          "/api/screener?sort=symbol;DROP",
          "/api/screener?unknown=1",
          "/api/screener?peaOnly=yes"
        ];
        const created = await call("/api/screener/presets", { method: "POST", body: JSON.stringify({ name: "Rendement", filters: { peaOnly: true, minDividendYield: 0.04 } }) });
        const createdPreset = await created.json();
        const invalidBody = (await call("/api/screener/presets", { method: "POST", body: JSON.stringify({ name: "", filters: { minDividendYield: 5 } }) })).status;
        const ownerList = await json("/api/screener/presets");
        const otherList = await json("/api/screener/presets", other.cookie);
        const otherDelete = (await call("/api/screener/presets/" + createdPreset.id, { method: "DELETE" }, other.cookie)).status;
        const ownerDelete = (await call("/api/screener/presets/" + createdPreset.id, { method: "DELETE" })).status;
        console.log("__RESULT__" + JSON.stringify({
          all: await json("/api/screener?sort=name&direction=asc"),
          yieldAndPer: await json("/api/screener?minDividendYield=0.04&maxTrailingPE=20"),
          peaOnly: await json("/api/screener?peaOnly=true&sector=energy"),
          etfs: await json("/api/screener?assetType=etf"),
          nearHigh: await json("/api/screener?maxDistanceFromHigh=0.05&sort=distanceFromHigh&direction=asc"),
          hostile,
          assetsAfterHostile: db.prepare("SELECT COUNT(*) AS total FROM assets").get().total,
          options: await json("/api/screener/options"),
          invalidStatuses: await Promise.all(invalid.map(async (path) => (await call(path)).status)),
          presets: { created: created.status, ownerList, otherList, otherDelete, invalidBody, ownerDelete, afterDelete: (await json("/api/screener/presets")).length },
          anonymousStatus: (await call("/api/screener", {}, null)).status
        }));
      } finally {
        server.close();
      }
    });
  `, { tempPrefix: "pea-screener-" }) as ScreenerHttpResult;

  const symbols = (response: ScreenerResponse) => response.rows.map((row) => row.symbol);
  assert.deepEqual(symbols(result.all), ["CW8.PA", "ENGI.PA", "XOM", "TTE.PA"], "indices are excluded, names sorted ascending");
  assert.equal(result.all.total, 4);
  assert.equal(result.all.truncated, false);
  assert.equal(result.all.rows.find((row) => row.symbol === "ENGI.PA")?.trailingPE, undefined, "a negative P/E is not exposed");
  assert.deepEqual(symbols(result.yieldAndPer), ["TTE.PA"], "Engie's negative P/E does not pass a P/E ceiling");
  assert.deepEqual(symbols(result.peaOnly), ["TTE.PA"], "US shares are filtered by the shared PEA rule, sector match is case-insensitive");
  assert.equal(result.peaOnly.rows[0]?.peaEligible, true);
  assert.deepEqual(symbols(result.etfs), ["CW8.PA"]);
  assert.deepEqual(symbols(result.nearHigh), ["CW8.PA", "ENGI.PA"]);
  assert.ok((result.nearHigh.rows[0]?.distanceFromHigh ?? 1) < 0.02);
  assert.deepEqual(result.hostile.rows, [], "a hostile value is just an unknown sector");
  assert.equal(result.assetsAfterHostile, 5);
  assert.deepEqual(result.options.sectors, ["Energy", "Utilities"]);
  assert.deepEqual(result.options.countries, ["France", "United States"]);
  assert.deepEqual(result.invalidStatuses, [400, 400, 400, 400, 400, 400]);

  assert.equal(result.presets.created, 201);
  assert.deepEqual(result.presets.ownerList.map((preset) => [preset.name, preset.filters]), [["Rendement", { peaOnly: true, minDividendYield: 0.04 }]]);
  assert.deepEqual(result.presets.otherList, [], "another user never sees the preset");
  assert.equal(result.presets.otherDelete, 404);
  assert.equal(result.presets.invalidBody, 400);
  assert.equal(result.presets.ownerDelete, 204);
  assert.equal(result.presets.afterDelete, 0);
  assert.equal(result.anonymousStatus, 401);
});
