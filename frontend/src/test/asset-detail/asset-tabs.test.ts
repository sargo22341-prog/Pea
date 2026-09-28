import type { AssetDetails } from "@pea/shared";
import { describe, expect, it } from "vitest";
import { availableAssetTabs, resolveAssetTab } from "../../pages/asset-detail/tabs/asset-tabs";

function asset(overrides: Partial<AssetDetails>): AssetDetails {
  return { dividends: [], news: [], isEtf: false, ...overrides } as AssetDetails;
}

describe("asset tabs", () => {
  it("hides every tab without data", () => {
    expect(availableAssetTabs(asset({}), { newsEnabled: true })).toEqual(["overview"]);
  });

  it("shows stock tabs only when their blocks have data", () => {
    const tabs = availableAssetTabs(
      asset({
        valuation: { trailingPE: 12, priceToBook: 2 },
        analystConsensus: { numberOfAnalystOpinions: 3 },
        dividends: [{ symbol: "A", date: "2025-01-01", amount: 1, currency: "EUR", status: "real" }],
        news: [{ title: "t", url: "https://example.com" } as AssetDetails["news"][number]]
      }),
      { newsEnabled: false }
    );
    expect(tabs).toEqual(["overview", "fundamentals", "analysts", "dividends"]);
  });

  it("replaces fundamentals and analysts by composition and performance for ETFs", () => {
    const tabs = availableAssetTabs(
      asset({
        isEtf: true,
        valuation: { trailingPE: 12, priceToBook: 2 },
        fundDetails: { holdings: [{ name: "A", weight: 0.1 }], trailingReturns: { oneYear: 0.1 } }
      }),
      { newsEnabled: true }
    );
    expect(tabs).toEqual(["overview", "composition", "performance"]);
  });

  it("falls back to the overview for an unknown or unavailable tab", () => {
    expect(resolveAssetTab("fundamentals", ["overview", "fundamentals"])).toBe("fundamentals");
    expect(resolveAssetTab("analysts", ["overview"])).toBe("overview");
    expect(resolveAssetTab("<script>", ["overview"])).toBe("overview");
    expect(resolveAssetTab(null, ["overview"])).toBe("overview");
  });
});
