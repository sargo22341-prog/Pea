import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

interface HistoryResult {
  unknownAsset: boolean;
  firstPass: boolean;
  afterFirstPass: unknown[];
  sameKey: boolean;
  missingKey: boolean;
  afterChange: unknown[];
  otherAssetUntouched: boolean;
  expired: unknown[];
  rows: number;
}

test("a consensus change is signalled only after a first reference and for a limited time", () => {
  const result = runBackendScript(`
    const { db } = await import("./db.ts");
    const { recordRecommendation, recentConsensusChanges, CONSENSUS_CHANGE_ALERT_DAYS } = await import("./services/market/analysts/recommendation-history.service.ts");
    db.prepare("INSERT INTO assets (symbol, name, currency) VALUES ('AI.PA', 'Air Liquide', 'EUR')").run();
    db.prepare("INSERT INTO assets (symbol, name, currency) VALUES ('MC.PA', 'LVMH', 'EUR')").run();
    const ai = db.prepare("SELECT id FROM assets WHERE symbol = 'AI.PA'").get().id;
    const mc = db.prepare("SELECT id FROM assets WHERE symbol = 'MC.PA'").get().id;
    const day = 24 * 60 * 60 * 1000;
    const start = Date.parse("2026-09-01T08:00:00.000Z");
    const list = (now) => [...recentConsensusChanges([ai, mc], now).entries()];

    const unknownAsset = recordRecommendation("UNKNOWN.PA", "buy", new Date(start));
    const firstPass = recordRecommendation("ai.pa", "hold", new Date(start));
    const afterFirstPass = list(start + day);
    const sameKey = recordRecommendation("AI.PA", "hold", new Date(start + day));
    const missingKey = recordRecommendation("AI.PA", undefined, new Date(start + day));
    recordRecommendation("MC.PA", "buy", new Date(start));
    recordRecommendation("AI.PA", "buy", new Date(start + 2 * day));
    const afterChange = list(start + 3 * day);
    const otherAssetUntouched = !recentConsensusChanges([mc], start + 3 * day).has(mc);
    const expired = list(start + (CONSENSUS_CHANGE_ALERT_DAYS + 3) * day);
    const rows = db.prepare("SELECT COUNT(*) AS count FROM asset_recommendation_history").get().count;
    console.log("__RESULT__" + JSON.stringify({ unknownAsset, firstPass, afterFirstPass, sameKey, missingKey, afterChange, otherAssetUntouched, expired, rows, ai }));
  `) as HistoryResult & { ai: number };

  assert.equal(result.unknownAsset, false);
  assert.equal(result.firstPass, true, "the first pass is stored as the reference");
  assert.deepEqual(result.afterFirstPass, [], "no alert on the first pass");
  assert.equal(result.sameKey, false, "an unchanged recommendation adds no row");
  assert.equal(result.missingKey, false);
  assert.deepEqual(result.afterChange, [[result.ai, { from: "hold", to: "buy", changedAt: "2026-09-03T08:00:00.000Z" }]]);
  assert.equal(result.otherAssetUntouched, true);
  assert.deepEqual(result.expired, [], "an old change is no longer signalled");
  assert.equal(result.rows, 3);
});
