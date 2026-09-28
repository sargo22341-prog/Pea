import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";
import { yahooUsageFeatureForKey } from "../../services/yahoo/usage/yahoo-usage-feature.js";

test("Yahoo request keys are classified by feature", () => {
  const cases: [string, string][] = [
    ["market-quote:AI.PA", "quotes"],
    ["market-quote-batch-raw:AI.PA,MC.PA", "quotes"],
    ["quote-summary:AI.PA", "quotes"],
    ["fundamentals:AI.PA", "fundamentals"],
    ["fundamentals-timeseries:AI.PA:annual-financials", "annual-statements"],
    ["fundamentals-timeseries:AI.PA:annual-balance-sheet", "annual-statements"],
    ["fundamentals-timeseries:AI.PA:quarterly-cash-flow", "quarterly-statements"],
    ["insights:AI.PA", "insights"],
    ["similar:AI.PA", "similar-assets"],
    ["chart:AI.PA:2016-01-01T00:00:00.000Z:now:1d:div|split", "dividends"],
    ["chart:AI.PA:2026-01-01T00:00:00.000Z:now:5m:history", "charts"],
    ["news:AI.PA:fr", "news"],
    ["screener:day_gainers", "screeners"],
    ["icon:AI.PA", "asset-icons"],
    ["something-new", "other"]
  ];
  for (const [key, feature] of cases) assert.equal(yahooUsageFeatureForKey(key), feature, key);
});

test("usage stats count calls of the last 24 hours by feature", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { recordYahooUsage, yahooUsageService } = await import("./services/yahoo/yahoo-usage.service.ts");
    recordYahooUsage("fundamentals:AI.PA", { durationMs: 10, success: true });
    recordYahooUsage("fundamentals:MC.PA", { durationMs: 10, success: false, errorMessage: "boom" });
    recordYahooUsage("market-quote:AI.PA", { durationMs: 10, success: true });
    db.prepare("INSERT INTO yahoo_usage_logs (created_at, method, feature) VALUES (?, 'quote', 'quotes')").run(new Date(Date.now() - 3 * 86400000).toISOString());
    const stats = yahooUsageService.stats({});
    console.log("__RESULT__" + JSON.stringify(stats.byFeature24h));
  `) as { key: string; calls: number; errors: number }[];

  assert.deepEqual(result.map((row) => [row.key, row.calls, row.errors]), [
    ["fundamentals", 2, 1],
    ["quotes", 1, 0]
  ]);
});
