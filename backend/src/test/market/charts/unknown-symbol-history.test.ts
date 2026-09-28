import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

test("live history of a never-tracked symbol prepares the requested range instead of staying empty", () => {
  const result = runBackendScript(`
    process.env.ENABLE_MARKET_LIVE_REFRESH = "true";
    const { dataConstructionQueue } = await import("./services/market/construction/data-construction-queue.service.ts");
    const { assetDataService } = await import("./services/assets/asset-data.service.ts");
    const queued = [];
    dataConstructionQueue.enqueueCandles = (symbol, range) => { queued.push(symbol + ":" + range); return { id: "job-test" }; };
    const chart = await assetDataService.chart("^FCHI", "1y");
    console.log("__RESULT__" + JSON.stringify({ queued, isPreparing: chart.isPreparing ?? false, missingRanges: chart.missingRanges ?? [], points: chart.timestamps.length }));
  `) as { queued: string[]; isPreparing: boolean; missingRanges: string[]; points: number };

  assert.deepEqual(result.queued, ["^FCHI:all"]);
  assert.equal(result.isPreparing, true);
  assert.deepEqual(result.missingRanges, ["all"]);
  assert.equal(result.points, 0);
});
