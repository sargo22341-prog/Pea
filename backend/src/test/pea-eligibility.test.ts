import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePeaEligibility,
  rankAssetForPea,
  sortAssetsForPea
} from "../services/assets/peaEligibility.js";

test("PEA eligibility accepts local whitelist entries with high confidence", () => {
  const asset = {
    symbol: "AI.PA",
    name: "Air Liquide",
    exchange: "Paris",
    quoteType: "EQUITY",
    currency: "EUR"
  };
  const result = evaluatePeaEligibility(asset);

  assert.equal(result.status, "eligible");
  assert.equal(result.confidence, "high");
  assert.equal(rankAssetForPea(asset).group, "pea_whitelist");
});

test("PEA eligibility accepts entries from the local PEA catalog before heuristic checks", () => {
  const wpea = {
    symbol: "WPEA.PA",
    name: "iShares MSCI World Swap PEA UCITS ETF",
    exchange: "Paris",
    quoteType: "ETF",
    currency: "EUR"
  };
  const danone = {
    symbol: "BN.PA",
    name: "Danone S.A.",
    exchange: "Paris",
    quoteType: "EQUITY",
    currency: "EUR"
  };

  const wpeaResult = evaluatePeaEligibility(wpea);
  const danoneResult = evaluatePeaEligibility(danone);

  assert.equal(wpeaResult.status, "eligible");
  assert.equal(wpeaResult.confidence, "high");
  assert.equal(danoneResult.status, "eligible");
  assert.equal(rankAssetForPea(wpea).group, "pea_whitelist");
});

test("PEA eligibility rejects US market symbols and ADR-like instruments", () => {
  const usStock = evaluatePeaEligibility({
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    exchange: "NASDAQ",
    quoteType: "EQUITY",
    currency: "USD"
  });
  const adr = evaluatePeaEligibility({
    symbol: "BABA",
    name: "Alibaba Group Holding Limited Sponsored ADR",
    exchange: "NYSE",
    quoteType: "EQUITY",
    currency: "USD"
  });

  assert.equal(usStock.status, "not_eligible");
  assert.equal(usStock.confidence, "high");
  assert.equal(adr.status, "not_eligible");
  assert.ok(adr.reasons.some((reason) => reason.includes("ADR")));
});

test("PEA eligibility rejects stocks listed outside EEA markets", () => {
  const result = evaluatePeaEligibility({
    symbol: "7974.T",
    name: "Nintendo Co., Ltd.",
    exchange: "Tokyo",
    quoteType: "EQUITY",
    currency: "JPY"
  });

  assert.equal(result.status, "not_eligible");
  assert.equal(result.confidence, "high");
  assert.ok(result.reasons.some((reason) => reason.includes("marche EEE")));
});

test("PEA eligibility keeps UCITS ETFs as unknown unless whitelisted", () => {
  const result = evaluatePeaEligibility({
    symbol: "EXAMPLE.PA",
    name: "Example MSCI World UCITS ETF",
    exchange: "Paris",
    quoteType: "ETF",
    currency: "EUR"
  });

  assert.equal(result.status, "unknown");
  assert.equal(result.confidence, "medium");
  assert.ok(result.warnings.some((warning) => warning.includes("ETF UCITS")));
});

test("PEA sorting prioritizes eligible and likely eligible assets before US assets", () => {
  const sorted = sortAssetsForPea([
    { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", quoteType: "EQUITY", currency: "USD" },
    { symbol: "ZZTEST.PA", name: "Example Paris Stock", exchange: "Paris", quoteType: "EQUITY", currency: "EUR" },
    { symbol: "CW8.PA", name: "Amundi MSCI World UCITS ETF", exchange: "Paris", quoteType: "ETF", currency: "EUR" }
  ]);

  assert.deepEqual(sorted.map((asset) => asset.symbol), ["CW8.PA", "ZZTEST.PA", "AAPL"]);
});
