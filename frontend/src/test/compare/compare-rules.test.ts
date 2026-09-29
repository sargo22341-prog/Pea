import type { CompareAssetDto } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { bestSymbols, COMPARE_METRICS, familyMetrics, formatMetric, metricValue } from "../../pages/compare/compare-metrics";
import { compareLink, parseCompareSymbols } from "../../pages/compare/compare-symbols";

function asset(symbol: string, overrides: Partial<CompareAssetDto> = {}): CompareAssetDto {
  return { symbol, name: symbol, isEtf: false, currency: "EUR", dividend: {}, ...overrides };
}

function second<T>(items: readonly T[]): T {
  const item = items[1];
  if (item === undefined) throw new Error("Expected a second item");
  return item;
}

const metric = (key: string) => {
  const found = COMPARE_METRICS.find((item) => item.key === key);
  if (!found) throw new Error(`metric ${key} missing`);
  return found;
};

describe("compare metrics", () => {
  it("highlights the lowest meaningful multiple and ignores a negative P/E", () => {
    const assets = [
      asset("A", { valuation: { trailingPE: 12 } }),
      asset("B", { valuation: { trailingPE: -4 } }),
      asset("C", { valuation: { trailingPE: 18 } })
    ];
    expect([...bestSymbols(metric("trailingPE"), assets)]).toEqual(["A"]);
    expect(formatMetric(metric("trailingPE"), second(assets))).toBe("n/a");
  });

  it("highlights the highest yield, keeps ties and needs two comparable values", () => {
    const tie = [asset("A", { dividend: { yield: 0.04 } }), asset("B", { dividend: { yield: 0.04 } }), asset("C")];
    expect([...bestSymbols(metric("dividendYield"), tie)].sort()).toEqual(["A", "B"]);
    expect(bestSymbols(metric("dividendYield"), [asset("A", { dividend: { yield: 0.04 } }), asset("B")]).size).toBe(0);
    expect(bestSymbols(metric("marketCap"), [asset("A", { valuation: { marketCap: 1 } }), asset("B", { valuation: { marketCap: 2 } })]).size).toBe(0);
  });

  it("marks stock-only rows n/a for an ETF and ETF rows n/a for a stock", () => {
    const stock = asset("MC.PA", { dividend: { payoutRatio: 0.5 }, fundDetails: { annualReportExpenseRatio: 0.01 } });
    const etf = asset("CW8.PA", { isEtf: true, dividend: { payoutRatio: 0.3 }, fundDetails: { annualReportExpenseRatio: 0.0038 } });
    expect(metricValue(metric("payoutRatio"), etf)).toBeUndefined();
    expect(metricValue(metric("expenseRatio"), stock)).toBeUndefined();
    expect(formatMetric(metric("expenseRatio"), etf)).toBe("0,38 %");
  });

  it("does not compare the debt of a financial company and hides families without data", () => {
    const bank = asset("BNP.PA", { financialHealth: { isFinancialSector: true, metrics: { debtToEquity: 400, profitMargin: 0.2 } } });
    expect(metricValue(metric("debtToEquity"), bank)).toBeUndefined();
    const keys = familyMetrics("health", [bank]).map((item) => item.key);
    expect(keys).toEqual(["profitMargin"]);
    expect(familyMetrics("fund", [bank])).toEqual([]);
  });

  it("ignores an unavailable asset", () => {
    expect(metricValue(metric("dividendYield"), asset("X", { unavailable: true, dividend: { yield: 0.1 } }))).toBeUndefined();
  });
});

describe("compare symbols", () => {
  it("normalizes, deduplicates and reports dropped symbols", () => {
    expect(parseCompareSymbols(" mc.pa,MC.PA,cw8.pa ")).toEqual({ symbols: ["MC.PA", "CW8.PA"] });
    expect(parseCompareSymbols("A,B,C,D,E")).toEqual({ symbols: ["A", "B", "C", "D"], issue: "tooMany" });
    expect(parseCompareSymbols("A,<script>,B")).toEqual({ symbols: ["A", "B"], issue: "invalid" });
    expect(parseCompareSymbols(null)).toEqual({ symbols: [] });
  });

  it("builds an encoded link", () => {
    expect(compareLink(["^FCHI", "AI.PA"])).toBe("/compare?symbols=%5EFCHI,AI.PA");
    expect(compareLink([])).toBe("/compare");
  });
});
