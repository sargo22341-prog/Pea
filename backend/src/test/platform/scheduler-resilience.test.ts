import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("scheduler ticks never reject when their tasks or lock storage fail", () => {
  const result = runBackendScript(`
    import { objectiveProjectionRefreshTask } from "./jobs/objectives/objective-projection-refresh.task.ts";
    import { schedulerLockRepository } from "./repositories/market/scheduler-lock.repository.ts";
    import { marketScheduler } from "./schedulers/market-scheduler.service.ts";
    import { objectiveScheduler } from "./schedulers/objective-scheduler.service.ts";

    objectiveProjectionRefreshTask.run = async () => {
      throw new Error("objective refresh failed");
    };
    schedulerLockRepository.acquire = () => {
      throw new Error("lock storage unavailable");
    };

    const outcomes = await Promise.allSettled([
      objectiveScheduler.tick(new Date(2026, 0, 5, 23, 10)),
      marketScheduler.tick(new Date(2026, 0, 5, 10, 0))
    ]);
    console.log("__RESULT__" + JSON.stringify({ statuses: outcomes.map((outcome) => outcome.status) }));
  `);

  assert.deepEqual(result.statuses, ["fulfilled", "fulfilled"]);
});
