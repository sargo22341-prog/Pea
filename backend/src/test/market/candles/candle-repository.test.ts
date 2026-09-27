import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

const seedAsset = `
  db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('AAA.PA', 'AAA', 'Paris', 'EUR')").run();
  const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'AAA.PA'").get().id;
  const candle = (datetimeStart, close) => ({
    assetId, range: "all", interval: "1d", datetimeStart, datetimeEnd: datetimeStart,
    open: close, high: close, low: close, close, volume: 1, source: "test"
  });
`;

test("candle batch is written atomically: an invalid candle leaves no partial write", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { candleRepository } = await import("./repositories/candles/candle.repository.ts");
    ${seedAsset}
    let failed = false;
    try {
      candleRepository.upsertCandles([candle("2026-01-05T08:00:00.000Z", 10), candle("2026-01-06T08:00:00.000Z", null)]);
    } catch {
      failed = true;
    }
    const count = db.prepare("SELECT COUNT(*) AS count FROM chart_candles").get().count;
    const written = candleRepository.upsertCandles([candle("2026-01-05T08:00:00.000Z", 10), candle("2026-01-06T08:00:00.000Z", 11)]);
    console.log("__RESULT__" + JSON.stringify({ failed, count, written, after: db.prepare("SELECT COUNT(*) AS count FROM chart_candles").get().count }));
  `) as { failed: boolean; count: number; written: number; after: number };

  assert.equal(result.failed, true);
  assert.equal(result.count, 0);
  assert.equal(result.written, 2);
  assert.equal(result.after, 2);
});

test("candles can be read from a lower bound and the latest stored datetime is exposed", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { candleRepository } = await import("./repositories/candles/candle.repository.ts");
    ${seedAsset}
    candleRepository.upsertCandles([
      candle("2026-01-07T08:00:00.000Z", 12),
      candle("2026-01-05T08:00:00.000Z", 10),
      candle("2026-01-06T08:00:00.000Z", 11)
    ]);
    console.log("__RESULT__" + JSON.stringify({
      all: candleRepository.readCandles(assetId, "all", "1d").map((point) => point.close),
      bounded: candleRepository.readCandles(assetId, "all", "1d", "2026-01-06T08:00:00.000Z").map((point) => point.close),
      latest: candleRepository.latestCandleDatetime(assetId, "all", "1d"),
      missing: candleRepository.latestCandleDatetime(assetId, "1w", "2h") ?? null
    }));
  `) as { all: number[]; bounded: number[]; latest: string; missing: string | null };

  assert.deepEqual(result.all, [10, 11, 12]);
  assert.deepEqual(result.bounded, [11, 12]);
  assert.equal(result.latest, "2026-01-07T08:00:00.000Z");
  assert.equal(result.missing, null);
});

test("prepared statements are reused and the statement cache stays bounded", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const first = db.prepare("SELECT 1 AS value");
    const second = db.prepare("SELECT 1 AS value");
    for (let index = 0; index < 700; index += 1) db.prepare("SELECT " + index + " AS value").get();
    console.log("__RESULT__" + JSON.stringify({ reused: first === second, size: db.cachedStatementCount(), value: db.prepare("SELECT 699 AS value").get().value }));
  `) as { reused: boolean; size: number; value: number };

  assert.equal(result.reused, true);
  assert.ok(result.size <= 500, String(result.size));
  assert.equal(result.value, 699);
});
