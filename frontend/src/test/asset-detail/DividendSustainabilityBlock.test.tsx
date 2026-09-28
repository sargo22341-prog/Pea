import type { AppFeatureKey, AssetDetails, DividendEvent } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagsContext } from "../../contexts/feature-flags-context";
import { api } from "../../lib/api";
import { DividendSustainabilityBlock } from "../../pages/asset-detail/components/dividends/DividendSustainabilityBlock";

vi.mock("../../lib/api", () => ({ api: { statements: vi.fn() } }));

const currentYear = new Date().getUTCFullYear();

function dividends(amounts: number[]): DividendEvent[] {
  return amounts.map((amount, index) => ({
    symbol: "AI.PA",
    date: `${currentYear - amounts.length + index}-05-15T00:00:00.000Z`,
    amount,
    currency: "EUR",
    status: "real"
  }));
}

function asset(overrides: Partial<AssetDetails> = {}): AssetDetails {
  return {
    quote: { symbol: "AI.PA", name: "Air Liquide", price: 170, currency: "EUR" },
    history: [],
    dividends: dividends([2, 2.1, 2.2, 2.3, 2.4, 2.5]),
    news: [],
    summary: {},
    marketInfo: { payoutRatio: 0.55, currency: "EUR" },
    ...overrides
  } as AssetDetails;
}

function renderBlock(value: AssetDetails, features: AppFeatureKey[] = ["extended_fundamentals"]) {
  return render(
    <FeatureFlagsContext value={features}>
      <DividendSustainabilityBlock asset={value} />
    </FeatureFlagsContext>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("DividendSustainabilityBlock", () => {
  it("rates the payout, the free cash flow coverage, the growth and the increase streak", async () => {
    vi.mocked(api.statements).mockResolvedValue({
      symbol: "AI.PA",
      period: "annual",
      rows: [{ endDate: `${currentYear - 1}-12-31`, freeCashFlow: 3000, dividendsPaid: 1500 }]
    });
    renderBlock(asset());

    expect(await screen.findByText("x2")).toBeInTheDocument();
    expect(screen.getByText("55 %")).toBeInTheDocument();
    expect(screen.getByText(/\+4,6 %\/an/)).toBeInTheDocument();
    expect(screen.getByText("5 ans")).toBeInTheDocument();
    expect(screen.getByText("Aristocrate")).toBeInTheDocument();
    expect(api.statements).toHaveBeenCalledWith("AI.PA", "annual", expect.anything());
  });

  it("requests no statement without extended fundamentals and hides the coverage", () => {
    renderBlock(asset(), []);

    expect(api.statements).not.toHaveBeenCalled();
    expect(screen.queryByText("Couverture par le FCF")).not.toBeInTheDocument();
    expect(screen.getByText("Taux de distribution")).toBeInTheDocument();
  });

  it("is hidden when too little is known about the dividend", () => {
    const { container } = renderBlock(asset({ dividends: dividends([1]), marketInfo: {} }), []);

    expect(container).toBeEmptyDOMElement();
  });
});
