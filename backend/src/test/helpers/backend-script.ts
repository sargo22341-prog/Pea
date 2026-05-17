import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type BackendScriptOptions = {
  nodeEnv?: string;
  tempPrefix?: string;
  env?: Record<string, string | undefined>;
};

export function runBackendScript(script: string, options: BackendScriptOptions = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), options.tempPrefix ?? "pea-test-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, "..", ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: options.nodeEnv ?? "development",
      PEA_TEST_SQLITE_PATH: sqlitePath,
      ...options.env
    }
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const jsonLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("__RESULT__"));

  assert.ok(jsonLine, result.stdout);
  return JSON.parse(jsonLine.slice("__RESULT__".length));
}

export const seedUser = `
db.prepare("INSERT INTO users (username, password_hash) VALUES ('tester', 'hash')").run();
`;

export const marketScriptHelpers = `
function addTracked(symbol, name, exchange) {
  db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, ?, 'EUR')").run(symbol, name, exchange);
  db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (1, ?, ?, 1, 10, 'EUR')").run(symbol, name);
}
function quoteRow(symbol, state = "REGULAR") {
  return {
    quote: { symbol, name: symbol, price: 10, currency: "EUR", marketState: state },
    snapshot: { symbol, marketState: state, regularMarketPrice: 10, currency: "EUR", exchange: symbol.endsWith(".T") ? "JPX" : "Paris" }
  };
}
function pricedQuoteRow(symbol, state, price) {
  return {
    quote: { symbol, name: symbol, price, previousClose: 1000, change: 118, changePercent: 9.94, currency: "EUR", marketState: state },
    snapshot: {
      symbol,
      shortName: symbol + " short",
      longName: symbol + " long",
      quoteType: "EQUITY",
      marketState: state,
      regularMarketPrice: price,
      regularMarketChange: 118,
      regularMarketChangePercent: 9.94,
      regularMarketTime: "2026-05-06T15:45:00.000Z",
      regularMarketPreviousClose: 1000,
      regularMarketOpen: 1190,
      regularMarketDayHigh: 1310,
      regularMarketDayLow: 1175,
      regularMarketVolume: 1234567,
      bid: 1304.5,
      ask: 1305.5,
      bidSize: 10,
      askSize: 11,
      averageDailyVolume3Month: 7654321,
      averageDailyVolume10Day: 2345678,
      fiftyTwoWeekLow: 49.24,
      fiftyTwoWeekHigh: 81.34,
      fiftyTwoWeekChangePercent: 42.83023,
      exDividendDate: "2026-06-30T00:00:00.000Z",
      currency: "EUR",
      exchange: "PAR",
      fullExchangeName: "Paris"
    }
  };
}
`;
