import { act, render, screen, waitFor } from "@testing-library/react";
import type { AssetChartDto, RangeKey } from "@pea/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAssetComparisonSeries, type ComparableAsset } from "../hooks/useAssetComparisonSeries";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    history: vi.fn(),
    requestChartRefresh: vi.fn()
  }
}));

const targets: ComparableAsset[] = [{ symbol: "URTH", name: "URTH" }];

function chart(points: number[]): AssetChartDto {
  return {
    symbol: "URTH",
    range: "intraday",
    interval: "5m",
    timestamps: points.map((_, index) => 1_000 + index * 1_000),
    prices: points,
    cachedAt: Date.now(),
    expiresAt: Date.now()
  };
}

function Probe({ range = "1d" as RangeKey }) {
  const state = useAssetComparisonSeries(targets, range);
  return (
    <div>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="series">{state.series.length}</span>
      <span data-testid="preparing">{state.preparingSymbols.join(",")}</span>
      <span data-testid="error">{state.error ?? ""}</span>
    </div>
  );
}

describe("useAssetComparisonSeries", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("displays a comparison series when history has data", async () => {
    vi.mocked(api.history).mockResolvedValue(chart([100, 101]) as never);

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("series").textContent).toBe("1"));
    expect(api.requestChartRefresh).not.toHaveBeenCalled();
  });

  it("starts one lazy initial refresh when history is empty", async () => {
    vi.mocked(api.history).mockResolvedValue(chart([]) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "started" } as never);

    render(<Probe />);

    await waitFor(() => expect(api.requestChartRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("preparing").textContent).toBe("URTH");
    expect(screen.getByTestId("series").textContent).toBe("0");
  });

  it("does not poll forever when history stays empty", async () => {
    vi.mocked(api.history).mockResolvedValue(chart([]) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "skipped-fresh" } as never);

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2_200));
    });

    expect(api.history).toHaveBeenCalledTimes(1);
    expect(api.requestChartRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("error").textContent).toContain("Comparaison indisponible");
  });

  it("refetches after SSE and then displays the refreshed comparison", async () => {
    vi.mocked(api.history)
      .mockResolvedValueOnce(chart([]) as never)
      .mockResolvedValueOnce(chart([100, 102]) as never);
    vi.mocked(api.requestChartRefresh).mockResolvedValue({ status: "started" } as never);

    render(<Probe />);

    await waitFor(() => expect(api.requestChartRefresh).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new CustomEvent("pea:market-event", {
        detail: { type: "asset-chart-updated", symbol: "URTH", range: "1d" }
      }));
    });

    await waitFor(() => expect(screen.getByTestId("series").textContent).toBe("1"));
  });

  it("keeps the previous comparison visible while another range is loading", async () => {
    let resolveSecond: (value: AssetChartDto) => void = () => undefined;
    vi.mocked(api.history)
      .mockResolvedValueOnce(chart([100, 101]) as never)
      .mockReturnValueOnce(new Promise<AssetChartDto>((resolve) => {
        resolveSecond = resolve;
      }) as never);

    const rendered = render(<Probe range="1d" />);
    await waitFor(() => expect(screen.getByTestId("series").textContent).toBe("1"));

    rendered.rerender(<Probe range="1w" />);

    expect(screen.getByTestId("series").textContent).toBe("1");
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await act(async () => {
      resolveSecond(chart([100, 103]));
    });

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("series").textContent).toBe("1");
  });
});
