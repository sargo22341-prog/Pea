import assert from "node:assert/strict";
import test from "node:test";
import { lookThroughExposure } from "../../../services/portfolio/analysis/look-through.js";

const round = (value: number) => Number(value.toFixed(6));

test("ETF holdings are merged with the lines held directly, including across listing places", () => {
  const exposure = lookThroughExposure([
    { symbol: "ASML.AS", name: "ASML Holding", weight: 20, etf: false },
    { symbol: "MC.PA", name: "LVMH", weight: 30, etf: false },
    { symbol: "CW8.PA", name: "Amundi MSCI World", weight: 40, etf: true, holdings: [{ symbol: "ASML", name: "ASML", weight: 0.05 }, { symbol: "AAPL", name: "Apple", weight: 0.1 }] },
    { symbol: "EXS1.DE", name: "Core DAX", weight: 10, etf: true, holdings: [{ symbol: "ASML.AS", name: "ASML", weight: 0.1 }] }
  ]);

  const asml = exposure.items.find((item) => item.key === "ASML.AS");
  assert.ok(asml);
  assert.deepEqual([asml.directWeight, round(asml.viaEtfWeight), round(asml.totalWeight)], [20, 3, 23]);
  assert.deepEqual(asml.viaEtf.map((source) => [source.symbol, round(source.weight)]), [["CW8.PA", 2], ["EXS1.DE", 1]]);
  assert.deepEqual(exposure.items.map((item) => item.key), ["MC.PA", "ASML.AS", "AAPL"]);
  assert.equal(exposure.etfCount, 2);
  // 85 % de CW8 et 90 % de l'ETF DAX ne sont pas détaillés par Yahoo.
  assert.equal(round(exposure.undisclosedEtfWeight), 43);
  const total = exposure.items.reduce((sum, item) => sum + item.totalWeight, 0) + exposure.undisclosedEtfWeight;
  assert.equal(round(total), 100, "look-through keeps the whole portfolio weight");
});

test("an ETF without published holdings is entirely undisclosed and never counted as decomposed", () => {
  const exposure = lookThroughExposure([
    { symbol: "AI.PA", name: "Air Liquide", weight: 70, etf: false },
    { symbol: "EMPTY.PA", name: "ETF", weight: 30, etf: true }
  ]);

  assert.equal(exposure.etfCount, 0);
  assert.equal(exposure.undisclosedEtfWeight, 30);
  assert.deepEqual(exposure.items.map((item) => item.key), ["AI.PA"]);
});

test("an ambiguous ticker is not matched to a direct line and holdings without symbol merge by name", () => {
  const exposure = lookThroughExposure([
    { symbol: "SAN.PA", name: "Sanofi", weight: 25, etf: false },
    { symbol: "SAN.MC", name: "Santander", weight: 25, etf: false },
    { symbol: "ETF1.PA", name: "ETF 1", weight: 25, etf: true, holdings: [{ symbol: "SAN", name: "?", weight: 0.1 }, { name: "Cash", weight: 0.02 }] },
    { symbol: "ETF2.PA", name: "ETF 2", weight: 25, etf: true, holdings: [{ name: " cash ", weight: 0.02 }] }
  ]);

  assert.deepEqual(exposure.items.find((item) => item.key === "SAN.PA")?.viaEtfWeight, 0);
  assert.equal(round(exposure.items.find((item) => item.key === "SAN")?.viaEtfWeight ?? 0), 2.5);
  const cash = exposure.items.find((item) => item.key === "name:cash");
  assert.deepEqual(cash?.viaEtf.map((source) => source.symbol), ["ETF1.PA", "ETF2.PA"]);
});
