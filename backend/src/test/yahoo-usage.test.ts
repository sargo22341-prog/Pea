import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../db.js";
import { scheduleYahooCall } from "../services/yahoo/yahoo.client.js";
import { yahooUsageRepository } from "../services/yahoo/yahoo-usage.repository.js";
import { inferYahooUsageMetadata, recordYahooUsage } from "../services/yahoo/yahoo-usage.service.js";

function clearUsageLogs() {
  db.prepare("DELETE FROM yahoo_usage_logs").run();
}

test.beforeEach(() => {
  clearUsageLogs();
});

test.after(() => {
  clearUsageLogs();
});

test("Yahoo usage tracking records a successful real call", async () => {
  const result = await scheduleYahooCall("quote:AIR.PA", async () => ({ ok: true }));

  const row = db.prepare("SELECT method, ticker, success, ticker_count FROM yahoo_usage_logs").get() as any;
  assert.deepEqual(result, { ok: true });
  assert.equal(row.method, "quote");
  assert.equal(row.ticker, "AIR.PA");
  assert.equal(row.success, 1);
  assert.equal(row.ticker_count, 1);
});

test("Yahoo usage tracking records a failed real call", async () => {
  await assert.rejects(
    scheduleYahooCall("fundamentals:AIR.PA", async () => {
      throw new Error("Yahoo exploded with a very explicit message");
    }),
    /Yahoo exploded/
  );

  const row = db.prepare("SELECT method, ticker, success, error_message, modules_json FROM yahoo_usage_logs").get() as any;
  assert.equal(row.method, "quoteSummary");
  assert.equal(row.ticker, "AIR.PA");
  assert.equal(row.success, 0);
  assert.match(row.error_message, /Yahoo exploded/);
  assert.ok(JSON.parse(row.modules_json).includes("calendarEvents"));
});

test("Yahoo usage tracking failure does not fail the business result", () => {
  const original = yahooUsageRepository.record;
  yahooUsageRepository.record = () => {
    throw new Error("database unavailable");
  };
  try {
    assert.doesNotThrow(() => recordYahooUsage("quote:BNP.PA", { durationMs: 12, success: true }));
  } finally {
    yahooUsageRepository.record = original;
  }
});

test("Yahoo usage stats aggregate and filter by day, hour, method, module and ticker", () => {
  yahooUsageRepository.record({
    method: "quoteSummary",
    modules: ["price", "calendarEvents"],
    ticker: "AIR.PA",
    durationMs: 42,
    success: true,
    internalSource: "asset-refresh"
  });
  yahooUsageRepository.record({
    method: "chart",
    ticker: "AIR.PA",
    range: "1d",
    interval: "5m",
    durationMs: 84,
    success: false,
    errorMessage: "timeout"
  });
  yahooUsageRepository.record({
    method: "quote",
    tickers: ["BNP.PA", "AI.PA"],
    durationMs: 21,
    success: true
  });

  const all = yahooUsageRepository.stats({});
  assert.equal(all.summary.totalCalls, 3);
  assert.equal(all.summary.errorCalls, 1);
  assert.equal(all.byMethod.find((row) => row.key === "chart")?.calls, 1);
  assert.equal(all.bySource.find((row) => row.key === "asset-refresh")?.calls, 1);
  assert.equal(all.topModules.find((row) => row.key === "calendarEvents")?.calls, 1);
  assert.ok(all.callsByDay.length >= 1);
  assert.ok(all.callsByHour.length >= 1);
  assert.equal(all.recentErrors[0]?.method, "chart");

  const moduleFiltered = yahooUsageRepository.stats({ module: "price" });
  assert.equal(moduleFiltered.summary.totalCalls, 1);
  assert.equal(moduleFiltered.byMethod[0]?.key, "quoteSummary");

  const tickerFiltered = yahooUsageRepository.stats({ ticker: "BNP.PA" });
  assert.equal(tickerFiltered.summary.totalCalls, 1);

  const errorFiltered = yahooUsageRepository.stats({ success: false });
  assert.equal(errorFiltered.summary.totalCalls, 1);
  assert.equal(errorFiltered.summary.errorCalls, 1);

  const latestCalls = yahooUsageRepository.list({ limit: 10 });
  assert.equal(latestCalls.length, 3);
  assert.equal(latestCalls[0]?.success, true);
  assert.deepEqual(yahooUsageRepository.list({ method: "chart" }).map((call) => call.method), ["chart"]);
  assert.deepEqual(yahooUsageRepository.list({ module: "calendarEvents" }).map((call) => call.method), ["quoteSummary"]);
  assert.equal(yahooUsageRepository.list({ ticker: "AIR.PA" }).length, 2);
  assert.equal(yahooUsageRepository.list({ id: latestCalls[0]!.id }).length, 1);
});

test("Yahoo usage metadata inference recognizes batch tickers and chart options", () => {
  assert.deepEqual(inferYahooUsageMetadata("quoteBatch:AIR.PA,BNP.PA"), {
    method: "quote",
    tickers: ["AIR.PA", "BNP.PA"],
    ticker: "AIR.PA",
    tickerCount: 2,
    internalSource: "portfolio-or-watchlist"
  });

  const chart = inferYahooUsageMetadata("chart:AIR.PA:2026-01-01T00:00:00.000Z:now:5m:history");
  assert.equal(chart.method, "chart");
  assert.equal(chart.ticker, "AIR.PA");
  assert.equal(chart.interval, "history");

  const trending = inferYahooUsageMetadata("quote:trendingSymbols:FR:AIR.PA,BNP.PA");
  assert.deepEqual(trending.tickers, ["AIR.PA", "BNP.PA"]);
  assert.equal(trending.internalSource, "top-movers");

  const quoteCombine = inferYahooUsageMetadata("quoteCombine:AI.PA");
  assert.equal(quoteCombine.method, "quoteCombine");
  assert.deepEqual(quoteCombine.tickers, ["AI.PA"]);
});
