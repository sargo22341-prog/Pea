import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

test("history exposes requested moving averages aligned on displayed points and rejects unknown overlays", () => {
  const result = runBackendScript(`
    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");
    ${sessionUserHelpers}
    const alice = createUserWithSession("alice");
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('MA.PA', 'Moving', 'Paris', 'EUR')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = 'MA.PA'").get();
    const start = Date.parse("2025-01-01T00:00:00.000Z");
    for (let day = 0; day < 260; day += 1) {
      const iso = new Date(start + day * 86400000).toISOString();
      db.prepare(
        "INSERT INTO chart_candles (asset_id, range_key, interval, datetime_start, datetime_end, open, high, low, close, volume) VALUES (?, 'all', '1d', ?, ?, ?, ?, ?, ?, 0)"
      ).run(asset.id, iso, iso, day, day, day, day);
    }

    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = \`http://127.0.0.1:\${server.address().port}\`;
      const get = (path) => fetch(baseUrl + path, { headers: { Cookie: alice.cookie } });
      try {
        const plain = await (await get("/api/history/MA.PA?range=all")).json();
        const withOverlays = await (await get("/api/history/MA.PA?range=all&overlays=ma50,ma200")).json();
        const invalid = (await get("/api/history/MA.PA?range=all&overlays=ma42")).status;
        const invalidAsset = (await get("/api/assets/MA.PA?range=all&overlays=rsi")).status;
        console.log("__RESULT__" + JSON.stringify({
          plainHasAverages: plain.movingAverages !== undefined,
          points: withOverlays.timestamps.length,
          ma50Length: withOverlays.movingAverages.ma50.length,
          lastPrice: withOverlays.prices.at(-1),
          lastMa50: withOverlays.movingAverages.ma50.at(-1),
          lastMa200: withOverlays.movingAverages.ma200.at(-1),
          firstMa50: withOverlays.movingAverages.ma50[0],
          invalid,
          invalidAsset
        }));
      } finally {
        server.close();
      }
    });
  `, { env: { ENABLE_MARKET_LIVE_REFRESH: "true" } }) as {
    plainHasAverages: boolean;
    points: number;
    ma50Length: number;
    lastPrice: number;
    lastMa50: number;
    lastMa200: number;
    firstMa50: number | null;
    invalid: number;
    invalidAsset: number;
  };

  assert.equal(result.plainHasAverages, false, "moving averages are only computed on demand");
  assert.equal(result.ma50Length, result.points);
  assert.equal(result.lastPrice, 259);
  assert.equal(result.lastMa50, 234.5, "average of closes 210..259");
  assert.equal(result.lastMa200, 159.5, "average of closes 60..259");
  assert.equal(result.firstMa50, null);
  assert.equal(result.invalid, 400);
  assert.equal(result.invalidAsset, 400);
});
