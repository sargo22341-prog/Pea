import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

test("splits from chart events and key statistics are recorded once despite different dates", () => {
  const result = runBackendScript(`
    const fs = await import("node:fs");
    const { db } = await import("./db.ts");
    const { yahooApi } = await import("./services/yahoo/yahoo.api.ts");
    const { dividendsService } = await import("./services/market/dividends/dividends.service.ts");
    const { recordSplitsFromKeyStatistics } = await import("./services/yahoo/fundamentals/key-statistics-splits.ts");
    const { normalizeDetectedSplit } = await import("./services/market/splits/asset-splits.service.ts");

    const events = JSON.parse(fs.readFileSync("test/fixtures/yahoo/split.chart-events.json", "utf8"));
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('NVDA', 'NVIDIA', 'NMS', 'USD')").run();
    const asset = db.prepare("SELECT id, symbol, name, exchange, currency FROM assets WHERE symbol = 'NVDA'").get();
    yahooApi.chart = async () => ({
      quotes: [],
      dividends: [],
      splits: events.splits.map((row) => normalizeDetectedSplit(row)).filter(Boolean)
    });

    await dividendsService.refreshDividends(asset);
    await dividendsService.refreshDividends(asset);
    // Même division vue par defaultKeyStatistics, datée de la veille à minuit UTC.
    recordSplitsFromKeyStatistics("NVDA", { defaultKeyStatistics: { lastSplitFactor: "10:1", lastSplitDate: Date.parse("2024-06-09T00:00:00Z") / 1000 } });
    // Division plus ancienne, hors de l'historique de dividendes téléchargé.
    recordSplitsFromKeyStatistics("NVDA", { defaultKeyStatistics: { lastSplitFactor: "4:1", lastSplitDate: Date.parse("2021-07-20T00:00:00Z") / 1000 } });
    recordSplitsFromKeyStatistics("NVDA", { defaultKeyStatistics: { lastSplitFactor: null } });
    recordSplitsFromKeyStatistics("UNKNOWN", { defaultKeyStatistics: { lastSplitFactor: "2:1", lastSplitDate: 1700000000 } });

    const rows = db.prepare("SELECT split_date, numerator, denominator, source FROM asset_splits ORDER BY split_date").all();
    console.log("__RESULT__" + JSON.stringify({
      rows,
      invalid: [
        normalizeDetectedSplit({ date: "2024-01-01", numerator: 1, denominator: 1 }) ?? null,
        normalizeDetectedSplit({ date: "not a date", numerator: 2, denominator: 1 }) ?? null,
        normalizeDetectedSplit({ date: "2024-01-01", numerator: 0, denominator: 1 }) ?? null
      ]
    }));
  `) as { rows: { split_date: string; numerator: number; denominator: number; source: string }[]; invalid: unknown[] };

  assert.deepEqual(result.rows, [
    { split_date: "2021-07-20", numerator: 4, denominator: 1, source: "yahoo-key-statistics" },
    { split_date: "2024-06-10", numerator: 10, denominator: 1, source: "yahoo-chart" }
  ]);
  assert.deepEqual(result.invalid, [null, null, null]);
});
