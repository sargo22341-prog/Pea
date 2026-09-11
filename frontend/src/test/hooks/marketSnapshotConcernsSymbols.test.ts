import { describe, expect, it } from "vitest";
import { marketSnapshotConcernsSymbols } from "../../hooks/useMarketEventReload";

const portfolio = new Set(["AI.PA", "MC.PA"]);

describe("marketSnapshotConcernsSymbols", () => {
  it("ignores broadcast snapshot updates for symbols outside the displayed list", () => {
    expect(marketSnapshotConcernsSymbols({ type: "market-snapshot-updated", symbol: "ASML.AS", symbols: ["ASML.AS"] }, portfolio)).toBe(false);
  });

  it("keeps snapshot updates for a displayed symbol, case-insensitively", () => {
    expect(marketSnapshotConcernsSymbols({ type: "market-snapshot-updated", symbols: ["ai.pa"] }, portfolio)).toBe(true);
    expect(marketSnapshotConcernsSymbols({ type: "market-snapshot-updated", symbol: "MC.PA" }, portfolio)).toBe(true);
  });

  it("keeps user-targeted snapshot updates without symbols and other event types", () => {
    expect(marketSnapshotConcernsSymbols({ type: "market-snapshot-updated", markets: ["XPAR"] }, portfolio)).toBe(true);
    expect(marketSnapshotConcernsSymbols({ type: "portfolio-chart-updated", symbol: "ASML.AS" }, portfolio)).toBe(true);
  });
});
