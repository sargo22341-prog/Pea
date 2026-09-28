import type { AppFeatureKey } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagsContext } from "../../contexts/feature-flags-context";
import { InsightsBlock } from "../../pages/asset-detail/components/insights/InsightsBlock";
import { SimilarAssetsRow } from "../../pages/asset-detail/components/similar/SimilarAssetsRow";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({ api: { similarAssets: vi.fn(), addWatchlist: vi.fn() } }));
vi.mock("../../components/common/AssetIcon", () => ({ AssetIcon: () => <span /> }));

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("InsightsBlock", () => {
  it("states the outlook, the relative valuation and always shows its source", () => {
    render(
      <InsightsBlock
        currency="USD"
        insights={{ provider: "Trading Central", shortTerm: { direction: "bearish", score: 2 }, midTerm: { direction: "bullish" }, valuation: { label: "overvalued", discount: -0.08 }, support: 255.65 }}
      />
    );

    expect(screen.getByText("Court terme · baissier")).toBeInTheDocument();
    expect(screen.getByText("Moyen terme · haussier")).toBeInTheDocument();
    expect(screen.getByText("Survalorise de 8 % selon Trading Central.")).toBeInTheDocument();
    expect(screen.getByText(/pas un conseil en investissement/)).toBeInTheDocument();
    expect(screen.queryByText("Support")).not.toBeInTheDocument();
  });
});

function renderRow(features: AppFeatureKey[], onCompare = vi.fn()) {
  render(
    <MemoryRouter>
      <FeatureFlagsContext value={features}>
        <SimilarAssetsRow onCompare={onCompare} symbol="MC.PA" />
      </FeatureFlagsContext>
    </MemoryRouter>
  );
  return onCompare;
}

describe("SimilarAssetsRow", () => {
  it("makes no request when the feature is disabled", () => {
    renderRow([]);
    expect(api.similarAssets).not.toHaveBeenCalled();
  });

  it("filters PEA-eligible assets, remembers the filter and prepares a comparison", async () => {
    vi.mocked(api.similarAssets).mockResolvedValue([
      { symbol: "OR.PA", name: "L'Oreal", price: 350, currency: "EUR", changePercent: 1.2, peaEligible: true },
      { symbol: "TPR", name: "Tapestry", price: 60, currency: "USD", changePercent: -0.5, peaEligible: false }
    ]);
    const onCompare = renderRow(["similar_assets"]);

    expect(await screen.findByText("Tapestry")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "PEA uniquement" }));
    expect(screen.queryByText("Tapestry")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("pea.similar.peaOnly")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Comparer avec L'Oreal" }));
    expect(onCompare).toHaveBeenCalledWith({ symbol: "OR.PA", name: "L'Oreal" });

    vi.mocked(api.addWatchlist).mockResolvedValue({} as never);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter L'Oreal a la liste de suivi" }));
    await waitFor(() => { expect(api.addWatchlist).toHaveBeenCalledWith({ symbol: "OR.PA", name: "L'Oreal", currency: "EUR" }); });
    await waitFor(() => { expect(screen.getByRole("button", { name: "Ajouter L'Oreal a la liste de suivi" })).toHaveAttribute("aria-pressed", "true"); });
  });
});
