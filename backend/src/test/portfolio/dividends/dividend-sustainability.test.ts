import assert from "node:assert/strict";
import test from "node:test";
import {
  FCF_COVERAGE_GOOD,
  FCF_COVERAGE_WEAK,
  PAYOUT_RATIO_GOOD_MAX,
  PAYOUT_RATIO_WEAK_ABOVE,
  freeCashFlowCoverage,
  rateFreeCashFlowCoverage,
  ratePayoutRatio
} from "@pea/shared";

test("payout ratio is rated by the shared thresholds", () => {
  assert.equal(ratePayoutRatio(0.45), "good");
  assert.equal(ratePayoutRatio(PAYOUT_RATIO_GOOD_MAX), "good");
  assert.equal(ratePayoutRatio(0.75), "fair");
  assert.equal(ratePayoutRatio(PAYOUT_RATIO_WEAK_ABOVE), "fair");
  assert.equal(ratePayoutRatio(1.2), "weak");
  assert.equal(ratePayoutRatio(-0.3), "weak", "a dividend paid despite a loss is fragile");
  assert.equal(ratePayoutRatio(0), undefined, "no dividend, nothing to rate");
  assert.equal(ratePayoutRatio(undefined), undefined);
});

test("free cash flow coverage uses the latest published fiscal year", () => {
  const coverage = freeCashFlowCoverage([
    { endDate: "2024-12-31", freeCashFlow: 900, dividendsPaid: 300 },
    { endDate: "2025-12-31", freeCashFlow: 1000, dividendsPaid: 500 },
    { endDate: "2026-06-30", isTtm: true, freeCashFlow: 100, dividendsPaid: 500 },
    { endDate: "2026-12-31", freeCashFlow: 1000 }
  ]);

  assert.deepEqual(coverage, { coverage: 2, endDate: "2025-12-31" });
  assert.equal(freeCashFlowCoverage([{ endDate: "2025-12-31", freeCashFlow: 1000, dividendsPaid: 0 }]), undefined);
  assert.equal(freeCashFlowCoverage([]), undefined);
});

test("free cash flow coverage is rated by the shared thresholds", () => {
  assert.equal(rateFreeCashFlowCoverage(FCF_COVERAGE_GOOD), "good");
  assert.equal(rateFreeCashFlowCoverage(1.2), "fair");
  assert.equal(rateFreeCashFlowCoverage(FCF_COVERAGE_WEAK), "fair");
  assert.equal(rateFreeCashFlowCoverage(0.4), "weak");
  assert.equal(rateFreeCashFlowCoverage(-1), "weak", "a negative free cash flow does not fund the dividend");
  assert.equal(rateFreeCashFlowCoverage(undefined), undefined);
});
