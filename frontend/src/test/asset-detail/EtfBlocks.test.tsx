import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EtfComposition } from "../../pages/asset-detail/components/etf/EtfComposition";
import { EtfPerformance } from "../../pages/asset-detail/components/etf/EtfPerformance";

vi.mock("../../components/charts/allocation/SectorAllocationChart", () => ({
  SectorAllocationChart: ({ data }: { data: { name: string }[] }) => <div>chart:{data.map((item) => item.name).join(",")}</div>
}));

vi.mock("../../pages/asset-detail/components/etf/EtfAnnualReturnsChart", () => ({
  EtfAnnualReturnsChart: ({ data }: { data: { year: number }[] }) => <div>annual:{data.map((row) => row.year).join(",")}</div>
}));

afterEach(() => {
  window.localStorage.clear();
});

describe("EtfComposition", () => {
  it("lists holdings with links and translated allocation and sectors", () => {
    render(
      <MemoryRouter>
        <EtfComposition
          data={{
            holdings: [{ symbol: "NVDA", name: "NVIDIA Corp", weight: 0.054 }, { name: "Cash EUR", weight: 0.01 }],
            allocation: { stock: 0.99, bond: 0, cash: 0.01, other: 0 },
            sectorWeightings: [{ key: "technology", value: 0.3 }, { key: "healthcare", value: 0.1 }]
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "NVIDIA Corp" })).toHaveAttribute("href", "/assets/NVDA");
    expect(screen.queryByRole("link", { name: "Cash EUR" })).not.toBeInTheDocument();
    expect(screen.getByText("5,40 %")).toBeInTheDocument();
    expect(screen.getByText("chart:Actions,Liquidites")).toBeInTheDocument();
    expect(screen.getByText("chart:Technologie,Sante")).toBeInTheDocument();
  });
});

describe("EtfPerformance", () => {
  it("shows available trailing returns and keeps yearly returns and risk collapsed", () => {
    render(
      <EtfPerformance
        data={{
          trailingReturns: { ytd: 0.14, oneYear: -0.05, threeYear: 0.17 },
          annualReturns: [{ year: 2024, value: 0.27 }, { year: 2025, value: 0.06 }],
          risk: { volatility: 0.12, sharpe: 1.17 }
        }}
      />
    );

    expect(screen.getByText("+14,0 %")).toHaveClass("text-mint");
    expect(screen.getByText("-5,0 %")).toHaveClass("text-coral");
    expect(screen.queryByText("10 ans")).not.toBeInTheDocument();
    expect(screen.queryByText(/annual:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /voir par annee/i }));
    expect(screen.getByText("annual:2024,2025")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /risque sur 3 ans/i }));
    expect(screen.getByText("12,0 %")).toBeInTheDocument();
    expect(screen.getByText("1,17")).toBeInTheDocument();
  });
});
