import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../helpers/backend-script.js";

test("regression: an incomplete Yahoo module does not make the whole fundamentals call fail", () => {
  const result = runBackendScript(`
    const { yahooClient } = await import("./services/yahoo/yahoo.client.ts");
    const { fetchExtraData } = await import("./services/yahoo/fundamentals/fundamentals.job.ts");
    const moduleOptions = [];
    // Réponse réelle d'Air Liquide : trimestres sans « difference » ni « surprisePct », refusés par le schéma.
    yahooClient.quoteSummary = async (_symbol, _options, options) => {
      moduleOptions.push(options ?? null);
      if (options?.validateResult !== false) throw new Error("Failed Yahoo Schema validation");
      return {
        summaryDetail: { trailingPE: 30, priceToSalesTrailing12Months: 3.4 },
        earnings: { earningsChart: { quarterly: [{ date: "2Q2026", actual: 1.2, estimate: 1.1 }] } }
      };
    };
    const extra = await fetchExtraData("AI.PA");
    console.log("__RESULT__" + JSON.stringify({ moduleOptions, trailingPE: extra.data.valuation?.trailingPE ?? null, quarters: extra.data.earnings?.quarters.length ?? 0 }));
  `) as { moduleOptions: unknown[]; trailingPE: number | null; quarters: number };

  assert.deepEqual(result.moduleOptions, [{ validateResult: false }]);
  assert.equal(result.trailingPE, 30);
  assert.equal(result.quarters, 1);
});
