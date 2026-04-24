import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluatePeaEligibility, rankAssetForPea, sortAssetsForPea } from "./peaEligibility.js";

describe("PEA eligibility local rules", () => {
  it("classifies TTE.PA as eligible via whitelist", () => {
    const result = evaluatePeaEligibility({ symbol: "TTE.PA", name: "TotalEnergies SE", quoteType: "EQUITY", exchange: "Paris" });
    assert.equal(result.status, "eligible");
    assert.equal(result.confidence, "high");
  });

  it("classifies TTE as not eligible", () => {
    const result = evaluatePeaEligibility({ symbol: "TTE", name: "TotalEnergies SE", quoteType: "EQUITY", exchange: "NYSE" });
    assert.equal(result.status, "not_eligible");
  });

  it("classifies AAPL and AMZN as not eligible", () => {
    assert.equal(evaluatePeaEligibility({ symbol: "AAPL", name: "Apple Inc.", quoteType: "EQUITY", exchange: "Nasdaq" }).status, "not_eligible");
    assert.equal(evaluatePeaEligibility({ symbol: "AMZN", name: "Amazon.com Inc.", quoteType: "EQUITY", exchange: "Nasdaq" }).status, "not_eligible");
  });

  it("classifies ASML.AS as likely eligible or eligible if whitelisted", () => {
    const result = evaluatePeaEligibility({ symbol: "ASML.AS", name: "ASML Holding", quoteType: "EQUITY", exchange: "Amsterdam" });
    assert.ok(["eligible", "likely_eligible"].includes(result.status));
  });

  it("classifies whitelisted PEA ETF as eligible", () => {
    const result = evaluatePeaEligibility({ symbol: "CW8.PA", name: "Amundi MSCI World UCITS ETF", quoteType: "ETF", exchange: "Paris" });
    assert.equal(result.status, "eligible");
    assert.equal(result.confidence, "high");
  });

  it("classifies non-whitelisted UCITS ETF as unknown", () => {
    const result = evaluatePeaEligibility({ symbol: "WLD.PA", name: "Example MSCI World UCITS ETF", quoteType: "ETF", exchange: "Paris" });
    assert.equal(result.status, "unknown");
    assert.equal(result.confidence, "medium");
  });

  it("classifies insufficient unknown symbol as unknown", () => {
    const result = evaluatePeaEligibility({ symbol: "ZZZZZ", name: "Unknown asset" });
    assert.equal(result.status, "unknown");
  });

  it("does not rank AMZN.MI before a clearly eligible European asset", () => {
    const sorted = sortAssetsForPea([
      { symbol: "AMZN.MI", name: "Amazon", quoteType: "EQUITY", exchange: "Milan" },
      { symbol: "ASML.AS", name: "ASML Holding", quoteType: "EQUITY", exchange: "Amsterdam" }
    ]);
    assert.equal(sorted[0].symbol, "ASML.AS");
    assert.notEqual(rankAssetForPea(sorted[1]).group, "likely_pea_stock");
  });
});
