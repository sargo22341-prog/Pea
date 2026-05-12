import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runBackendScript(script: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-dividends-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development", SQLITE_PATH: sqlitePath }
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith("__RESULT__"));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice("__RESULT__".length));
}

test("dividends reading keeps the latest amount when Yahoo corrected a same-date dividend", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { dividendsService } = await import("./services/market/dividends.service.ts");
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('7974.T', 'Nintendo', 'JPX', 'JPY')").run();
    const asset = db.prepare("SELECT id FROM assets WHERE symbol = '7974.T'").get();
    db.prepare("INSERT INTO asset_dividends (asset_id, ex_date, amount, currency, updated_at) VALUES (?, '2026-03-30T00:00:00.000Z', 139, 'JPY', '2026-05-04 22:24:38')").run(asset.id);
    db.prepare("INSERT INTO asset_dividends (asset_id, ex_date, amount, currency, updated_at) VALUES (?, '2026-03-30T00:00:00.000Z', 177, 'JPY', '2026-05-11 18:53:08')").run(asset.id);
    const dividends = dividendsService.readDividends('7974.T');
    console.log("__RESULT__" + JSON.stringify({ dividends }));
  `);

  assert.deepEqual(result.dividends.map((dividend: { amount: number }) => dividend.amount), [177]);
});

test("dividend refresh replaces stale same-date amounts", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { dividendsService } = await import("./services/market/dividends.service.ts");
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('7974.T', 'Nintendo', 'JPX', 'JPY')").run();
    const asset = db.prepare("SELECT id, symbol, name, exchange, currency FROM assets WHERE symbol = '7974.T'").get();
    db.prepare("INSERT INTO asset_dividends (asset_id, ex_date, amount, currency) VALUES (?, '2026-03-30T00:00:00.000Z', 139, 'JPY')").run(asset.id);
    yahooApi.chart = async () => ({ quotes: [], dividends: [{ date: '2026-03-30T00:00:00.000Z', amount: 177 }], splits: [] });
    await dividendsService.refreshDividends(asset);
    const rows = db.prepare("SELECT ex_date, amount FROM asset_dividends WHERE asset_id = ? ORDER BY amount").all(asset.id);
    console.log("__RESULT__" + JSON.stringify({ rows }));
  `);

  assert.deepEqual(result.rows, [{ ex_date: "2026-03-30T00:00:00.000Z", amount: 177 }]);
});
