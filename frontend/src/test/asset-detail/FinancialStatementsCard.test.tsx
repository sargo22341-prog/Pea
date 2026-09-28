import type { AppFeatureKey } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagsContext } from "../../contexts/feature-flags-context";
import { FinancialStatementsCard } from "../../pages/asset-detail/components/fundamentals/statements/FinancialStatementsCard";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({ api: { statements: vi.fn() } }));
vi.mock("../../components/charts/financial/FinancialComboChart", () => ({ FinancialComboChart: () => <div>results-chart</div> }));
vi.mock("../../pages/asset-detail/components/fundamentals/statements/StatementsChart", () => ({
  StatementsChart: ({ rows, series }: { rows: { label: string }[]; series: { key: string }[] }) => (
    <div>statements-chart:{series.map((item) => item.key).join(",")}:{rows.map((row) => row.label).join(",")}</div>
  )
}));

const financials = [{ year: 2025, revenue: 100, netIncome: 10, netMargin: 10 }];

function renderCard(features: AppFeatureKey[]) {
  return render(
    <FeatureFlagsContext value={features}>
      <FinancialStatementsCard currency="EUR" financials={financials} symbol="MC.PA" />
    </FeatureFlagsContext>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("FinancialStatementsCard", () => {
  it("keeps only the results view and makes no request without extended fundamentals", () => {
    renderCard([]);

    expect(screen.getByText("results-chart")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Bilan" })).not.toBeInTheDocument();
    expect(api.statements).not.toHaveBeenCalled();
  });

  it("shows balance sheet and cash flow with the trailing twelve months point, quarterly only on demand", async () => {
    vi.mocked(api.statements).mockImplementation((_symbol, period) => Promise.resolve({
      symbol: "MC.PA",
      period,
      currency: "EUR",
      rows: period === "annual"
        ? [
            { endDate: "2024-12-31T00:00:00.000Z", netDebt: 10, totalEquity: 50, freeCashFlow: 8, dividendsPaid: 4 },
            { endDate: "2026-06-30T00:00:00.000Z", isTtm: true, netDebt: 12, totalEquity: 55, freeCashFlow: 9, dividendsPaid: 5 }
          ]
        : [{ endDate: "2026-06-30T00:00:00.000Z", netDebt: 12, totalEquity: 55 }]
    }));

    renderCard(["extended_fundamentals", "quarterly_statements"]);
    fireEvent.click(await screen.findByRole("tab", { name: "Bilan" }));
    expect(await screen.findByText("statements-chart:netDebt,totalEquity,cash:2024,12 mois glissants")).toBeInTheDocument();
    expect(api.statements).toHaveBeenCalledTimes(1);
    expect(api.statements).toHaveBeenCalledWith("MC.PA", "annual", expect.anything());

    fireEvent.click(screen.getByRole("tab", { name: "Flux" }));
    expect(screen.getByText("statements-chart:freeCashFlow,dividendsPaid:2024,12 mois glissants")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Trimestriel" }));
    await waitFor(() => { expect(api.statements).toHaveBeenCalledWith("MC.PA", "quarterly", expect.anything()); });
    fireEvent.click(screen.getByRole("tab", { name: "Bilan" }));
    expect(await screen.findByText("statements-chart:netDebt,totalEquity,cash:T2 2026")).toBeInTheDocument();
  });

  it("hides the quarterly switch when the administrator disabled it", async () => {
    vi.mocked(api.statements).mockResolvedValue({ symbol: "MC.PA", period: "annual", rows: [{ endDate: "2024-12-31T00:00:00.000Z", netDebt: 1, totalEquity: 2 }] });

    renderCard(["extended_fundamentals"]);
    fireEvent.click(await screen.findByRole("tab", { name: "Bilan" }));

    expect(await screen.findByText(/statements-chart/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Trimestriel" })).not.toBeInTheDocument();
  });
});
