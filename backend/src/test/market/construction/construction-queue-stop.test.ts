import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

test("stopping the construction queue waits for running tasks and claims no new ones", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { DataConstructionQueueService } = await import("./services/market/construction/data-construction-queue.service.ts");
    const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");

    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('AAA.PA', 'AAA', 'Paris', 'EUR')").run();
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES ('BBB.PA', 'BBB', 'Paris', 'EUR')").run();
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    let finishSnapshot;
    const refreshed = [];
    marketSnapshotService.refreshMarketSnapshot = async (asset) => {
      refreshed.push(asset.symbol);
      signalStarted();
      await new Promise((resolve) => { finishSnapshot = resolve; });
      return { symbol: asset.symbol, name: asset.symbol, price: 1, currency: "EUR" };
    };

    const queue = new DataConstructionQueueService();
    queue.enqueueForSymbols("snapshot", ["AAA.PA"]);
    await started;
    let stopped = false;
    const stopping = queue.stop().then(() => { stopped = true; });
    queue.enqueueForSymbols("snapshot", ["BBB.PA"]);
    await Promise.resolve();
    const stoppedWhileRunning = stopped;
    finishSnapshot();
    await stopping;

    const statuses = Object.fromEntries(db.prepare("SELECT symbol, status FROM data_construction_tasks").all().map((row) => [row.symbol, row.status]));
    console.log("__RESULT__" + JSON.stringify({ stoppedWhileRunning, stopped, refreshed, statuses }));
  `) as { stoppedWhileRunning: boolean; stopped: boolean; refreshed: string[]; statuses: Record<string, string> };

  assert.equal(result.stoppedWhileRunning, false);
  assert.equal(result.stopped, true);
  assert.deepEqual(result.refreshed, ["AAA.PA"]);
  assert.deepEqual(result.statuses, { "AAA.PA": "success", "BBB.PA": "queued" });
});
