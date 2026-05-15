import assert from "node:assert/strict";
import test from "node:test";
import type { PositionWithMarket } from "@pea/shared";
import { getPositionSectorExposure } from "../services/portfolio/portfolio-analysis.service.js";

type SectorFundamentals = Parameters<typeof getPositionSectorExposure>[1];

function position(symbol: string, quoteType = "EQUITY"): PositionWithMarket {
  return {
    id: 1,
    symbol,
    name: symbol,
    quantity: 1,
    averageBuyPrice: 100,
    currency: "EUR",
    createdAt: "2026-01-01T00:00:00.000Z",
    currentPrice: 100,
    marketValue: 100,
    costBasis: 100,
    performance: 0,
    performancePercent: 0,
    quote: {
      symbol,
      name: symbol,
      price: 100,
      currency: "EUR",
      quoteType
    }
  };
}

test("stock sector exposure keeps 100 percent in its sector", () => {
  const exposure = getPositionSectorExposure(position("ACME.PA"), { assetProfile: { sectorDisp: "Technology" } } as SectorFundamentals, 25);

  assert.deepEqual(exposure, [{ sector: "Technology", weight: 25 }]);
});

test("ETF sector exposure splits portfolio weight by Yahoo top holdings sectors", () => {
  const exposure = getPositionSectorExposure(
    position("ETF.PA", "ETF"),
    {
      topHoldings: {
        sectorWeightings: [{ technology: 0.4, healthcare: 0.2, financial_services: 0.4 }]
      }
    } as SectorFundamentals,
    50
  );

  assert.deepEqual(exposure, [
    { sector: "Technologie", weight: 20 },
    { sector: "Services financiers", weight: 20 },
    { sector: "Sante", weight: 10 }
  ]);
});

test("mixed stock and ETF exposures keep the analyzed total weight", () => {
  const stock = getPositionSectorExposure(position("AIR.PA"), { assetProfile: { sector: "Industrials" } } as SectorFundamentals, 60);
  const etf = getPositionSectorExposure(
    position("WORLD.PA", "ETF"),
    { topHoldings: { sectorWeightings: [{ technology: 40, healthcare: 20, financial_services: 40 }] } } as SectorFundamentals,
    40
  );
  const total = [...stock, ...etf].reduce((sum, item) => sum + item.weight, 0);

  assert.equal(total, 100);
  assert.deepEqual(stock, [{ sector: "Industrials", weight: 60 }]);
  assert.deepEqual(etf, [
    { sector: "Technologie", weight: 16 },
    { sector: "Services financiers", weight: 16 },
    { sector: "Sante", weight: 8 }
  ]);
});

test("ETF without sector data falls back to ETF diversified bucket", () => {
  const exposure = getPositionSectorExposure(position("EMPTY.PA", "ETF"), { topHoldings: {} } as SectorFundamentals, 15);

  assert.deepEqual(exposure, [{ sector: "ETF / Diversified", weight: 15 }]);
});

test("invalid ETF sector values are ignored without producing NaN", () => {
  const exposure = getPositionSectorExposure(
    position("BROKEN.PA", "ETF"),
    { topHoldings: { sectorWeightings: [{ technology: "bad", healthcare: undefined, energy: 0 }] } } as SectorFundamentals,
    30
  );

  assert.deepEqual(exposure, [{ sector: "ETF / Diversified", weight: 30 }]);
});
