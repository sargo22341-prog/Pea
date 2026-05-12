import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DividendLineChartSection } from "../components/charts/DividendLineChartSection";

vi.mock("../components/charts/SafeResponsiveContainer", () => ({
  SafeResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("recharts", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Empty = () => null;
  const LineChart = ({ children, data }: { children: React.ReactNode; data: Array<{ amount: number }> }) => (
    <div data-testid="line-chart">
      {React.Children.map(children, (child) => (React.isValidElement(child) ? React.cloneElement(child, { chartData: data } as never) : child))}
    </div>
  );
  const Line = ({ chartData = [], label }: { chartData?: Array<{ amount: number }>; label?: React.ReactNode }) => (
    <>
      {chartData.map((point, index) =>
        React.isValidElement(label)
          ? React.cloneElement(label, { key: index, x: 20 + index * 20, y: 40, value: point.amount } as never)
          : null
      )}
    </>
  );

  return {
    CartesianGrid: Empty,
    Line,
    LineChart,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty
  };
});

describe("DividendLineChartSection", () => {
  it("uses the asset currency for labels and hides PRU yield without a position", () => {
    render(
      <DividendLineChartSection
        currentPrice={1000}
        dividends={[{ symbol: "7974.T", date: "2026-03-31T00:00:00.000Z", amount: 50, currency: "JPY", status: "real" }]}
        marketInfo={{ currency: "JPY" }}
      />
    );

    expect(screen.getByText(/50\sJPY/)).toBeInTheDocument();
    expect(screen.queryByText(/sur PRU/)).not.toBeInTheDocument();
  });

  it("does not add an estimated market dividend when a real dividend already exists in the same month", () => {
    render(
      <DividendLineChartSection
        currentPrice={1000}
        dividends={[{ symbol: "7974.T", date: "2026-03-31T00:00:00.000Z", amount: 50, currency: "JPY", status: "real" }]}
        marketInfo={{
          currency: "JPY",
          dividendRate: 120,
          exDividendDate: "2026-03-27T00:00:00.000Z"
        }}
      />
    );

    expect(screen.getAllByText(/JPY/)).toHaveLength(1);
  });
});
