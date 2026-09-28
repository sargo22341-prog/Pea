import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("fundamentals cached without the new modules become stale but remain available as fallback", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { expireFundamentalsMissingModulesMigration } = await import("./migrations/cache/038-expire-fundamentals-missing-modules.ts");
    const { readCachedFundamentalsSummary } = await import("./services/yahoo/fundamentals/fundamentals.job.ts");
    const now = Math.floor(Date.now() / 1000);
    const insert = db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at) VALUES (?, ?, ?, ?)");
    insert.run("fundamentals", "OLD.PA", JSON.stringify({ price: { currency: "EUR" } }), now);
    insert.run("fundamentals", "NEW.PA", JSON.stringify({ defaultKeyStatistics: { forwardPE: 12 }, recommendationTrend: { trend: [] } }), now);
    insert.run("fundamentals", "HALF.PA", JSON.stringify({ defaultKeyStatistics: { forwardPE: 12 } }), now);
    insert.run("fundamentals", "OLD.PA:ANNUAL-FINANCIALS", JSON.stringify([]), now);

    expireFundamentalsMissingModulesMigration.appliquer(db);

    console.log("__RESULT__" + JSON.stringify({
      old: readCachedFundamentalsSummary("OLD.PA"),
      fresh: readCachedFundamentalsSummary("NEW.PA")?.stale,
      half: readCachedFundamentalsSummary("HALF.PA")?.stale,
      financials: db.prepare("SELECT fetched_at FROM cache_entries WHERE key = 'OLD.PA:ANNUAL-FINANCIALS'").get().fetched_at === now
    }));
  `) as { old: { stale: boolean; data: unknown } | null; fresh: boolean; half: boolean; financials: boolean };

  assert.equal(result.old?.stale, true, "an outdated summary must trigger a Yahoo refetch");
  assert.deepEqual(result.old.data, { price: { currency: "EUR" } }, "the stale summary is kept as fallback");
  assert.equal(result.fresh, false);
  assert.equal(result.half, true, "a summary without the analyst trend module is refreshed too");
  assert.equal(result.financials, true);
});
