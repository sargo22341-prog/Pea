import assert from "node:assert/strict";
import test from "node:test";
import { marketScriptHelpers as helpers, runBackendScript as runIsolatedBackendScript, seedUser } from "./helpers/backend-script.js";

/**
 * Tests dédiés au comportement d'upsert du snapshot marché : préservation des valeurs utiles
 * face aux nulls Yahoo, fusion marketInfo / quoteSummary, et garanties du DTO.
 *
 * Extrait de `market-auto-scheduler.test.ts` (Phase 4.4) pour ramener ce dernier sous 300 lignes.
 */

function runBackendScript(script: string) {
  return runIsolatedBackendScript(script, { tempPrefix: "pea-snapshot-upsert-" });
}

test("snapshot upsert keeps useful existing values when Yahoo returns null fields", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { marketSnapshotService } from "./services/market/snapshots/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    marketSnapshotService.upsertSnapshot(asset.id, pricedQuoteRow("AAA.PA", "POSTPOST", 1305).snapshot);
    db.prepare("UPDATE asset_quote_snapshot SET updated_at = '2026-05-06T15:45:00.000Z' WHERE asset_id = ?").run(asset.id);
    db.prepare("UPDATE asset_quote_range SET updated_at = '2026-05-06T15:45:00.000Z' WHERE asset_id = ?").run(asset.id);
    db.prepare("UPDATE asset_dividend_snapshot SET updated_at = '2026-05-06T15:45:00.000Z' WHERE asset_id = ?").run(asset.id);
    marketSnapshotService.upsertSnapshot(asset.id, {
      symbol: "AAA.PA",
      marketState: "POSTPOST",
      regularMarketPrice: null,
      regularMarketChange: null,
      regularMarketChangePercent: null,
      regularMarketPreviousClose: null,
      regularMarketOpen: null,
      regularMarketDayHigh: null,
      regularMarketDayLow: null,
      regularMarketVolume: null,
      bid: null,
      ask: null,
      bidSize: null,
      askSize: null,
      averageDailyVolume3Month: null,
      averageDailyVolume10Day: null,
      fiftyTwoWeekLow: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekChangePercent: null,
      exDividendDate: null,
      currency: null,
      exchange: null,
      fullExchangeName: null,
      quoteType: null,
      regularMarketTime: null
    });
    const row = db.prepare("SELECT market_state, last_price, day_change, day_change_percent, previous_close, open_price, day_high, day_low, volume, bid_price, ask_price, regular_market_time, average_volume_3m, average_volume_10d, fifty_two_week_low, fifty_two_week_high, fifty_two_week_change_percent, ex_dividend_date, updated_at FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
    console.log("__RESULT__" + JSON.stringify(row));
  `);

  assert.equal(result.market_state, "POSTPOST");
  assert.equal(result.last_price, 1305);
  assert.equal(result.day_change, 118);
  assert.equal(result.day_change_percent, 9.94);
  assert.equal(result.previous_close, 1000);
  assert.equal(result.open_price, 1190);
  assert.equal(result.day_high, 1310);
  assert.equal(result.day_low, 1175);
  assert.equal(result.volume, 1234567);
  assert.equal(result.bid_price, 1304.5);
  assert.equal(result.ask_price, 1305.5);
  assert.equal(result.regular_market_time, "2026-05-06T15:45:00.000Z");
  assert.equal(result.average_volume_3m, 7654321);
  assert.equal(result.average_volume_10d, 2345678);
  assert.equal(result.fifty_two_week_low, 49.24);
  assert.equal(result.fifty_two_week_high, 81.34);
  assert.equal(result.fifty_two_week_change_percent, 42.83023);
  assert.equal(result.ex_dividend_date, "2026-06-30T00:00:00.000Z");
  assert.equal(result.updated_at, "2026-05-06T15:45:00.000Z");
});

test("marketInfo from quoteSummary replaces missing slow snapshot fields and preserves them against n/a", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { marketSnapshotService } from "./services/market/snapshots/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("TTE.PA", "TotalEnergies", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'TTE.PA'").get();
    db.prepare("INSERT INTO asset_quote_snapshot (asset_id, market_state, source, updated_at) VALUES (?, 'POSTPOST', 'seed', '2026-05-06T15:45:00.000Z')").run(asset.id);
    marketSnapshotService.upsertMarketInfo(asset.id, {
      fiftyTwoWeekLow: 49.24,
      fiftyTwoWeekHigh: 81.34,
      averageDailyVolume3Month: 6128825,
      exDividendDate: "2026-06-30T00:00:00.000Z",
      dividendRate: 3.16,
      dividendYield: 0.05
    });
    marketSnapshotService.upsertMarketInfo(asset.id, {
      fiftyTwoWeekLow: undefined,
      fiftyTwoWeekHigh: undefined,
      averageDailyVolume3Month: undefined,
      exDividendDate: undefined,
      dividendRate: undefined,
      dividendYield: undefined
    });
    const dto = marketSnapshotService.readMarketDto("TTE.PA");
    const row = db.prepare("SELECT average_volume_3m, fifty_two_week_low, fifty_two_week_high, ex_dividend_date FROM asset_market_snapshots WHERE asset_id = ?").get(asset.id);
    console.log("__RESULT__" + JSON.stringify({ dto, row }));
  `);

  assert.equal(result.row.average_volume_3m, 6128825);
  assert.equal(result.row.fifty_two_week_low, 49.24);
  assert.equal(result.row.fifty_two_week_high, 81.34);
  assert.equal(result.row.ex_dividend_date, "2026-06-30T00:00:00.000Z");
  assert.equal(result.dto.avgVolume3M, 6128825);
  assert.equal(result.dto.week52Low, 49.24);
  assert.equal(result.dto.week52High, 81.34);
  assert.equal(result.dto.exDividendDate, "2026-06-30T00:00:00.000Z");
});

test("market snapshot dto does not convert missing numeric fields to zero", () => {
  const result = runBackendScript(`
    import { db } from "./db.ts";
    import { marketSnapshotService } from "./services/market/snapshots/market-snapshot.service.ts";
    ${seedUser}
    ${helpers}
    addTracked("AAA.PA", "AAA", "Paris");
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get();
    db.prepare("INSERT INTO asset_quote_snapshot (asset_id, market_state, source, updated_at) VALUES (?, 'POSTPOST', 'seed', '2026-05-06T15:45:00.000Z')").run(asset.id);
    const dto = marketSnapshotService.readMarketDto("AAA.PA");
    console.log("__RESULT__" + JSON.stringify({
      dayChange: dto.dayChange,
      dayChangePercent: dto.dayChangePercent,
      volume: dto.volume
    }));
  `);

  assert.equal(result.dayChange, undefined);
  assert.equal(result.dayChangePercent, undefined);
  assert.equal(result.volume, undefined);
});
