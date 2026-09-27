import type { AssetDetails } from "@pea/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAssetDetailData } from "../../pages/asset-detail/hooks/useAssetDetailData";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    asset: vi.fn(),
    history: vi.fn(),
    positionPerformance: vi.fn()
  }
}));

function details(range: string, withPosition = true) {
  return {
    quote: { symbol: "AI.PA", name: "Air Liquide", price: 100, currency: "EUR" },
    chart: { symbol: "AI.PA", range, interval: "1d", timestamps: [1, 2], prices: [1, 2], cachedAt: 0, expiresAt: 0 },
    position: withPosition ? { id: 7 } : undefined,
    positionRangePerformance: withPosition ? { id: 7, intervalPerformancePercent: range === "1d" ? 1 : 0 } : undefined,
    news: [{ title: "full details only" }]
  } as unknown as AssetDetails;
}

describe("useAssetDetailData", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads only the chart and position performance when the range changes", async () => {
    vi.mocked(api.asset).mockResolvedValue(details("1d"));
    vi.mocked(api.history).mockResolvedValue({ symbol: "AI.PA", range: "1M", interval: "4h", timestamps: [10, 20, 30], prices: [5, 6, 7], cachedAt: 0, expiresAt: 0 });
    vi.mocked(api.positionPerformance).mockResolvedValue({ id: 7, intervalPerformancePercent: 12 } as never);

    const { result, rerender } = renderHook(({ range }) => useAssetDetailData("AI.PA", range), { initialProps: { range: "1d" as "1d" | "1m" } });
    await waitFor(() => { expect(result.current.data?.chart?.timestamps).toEqual([1, 2]); });

    rerender({ range: "1m" });
    expect(result.current.loading).toBe(true);
    await waitFor(() => { expect(result.current.data?.chart?.timestamps).toEqual([10, 20, 30]); });

    expect(api.asset).toHaveBeenCalledTimes(1);
    expect(api.history).toHaveBeenCalledWith("AI.PA", "1m", expect.anything());
    expect(api.positionPerformance).toHaveBeenCalledWith(7, "1m", expect.anything());
    expect(result.current.data?.positionRangePerformance?.intervalPerformancePercent).toBe(12);
    expect(result.current.data?.news).toEqual([{ title: "full details only" }]);
    expect(result.current.loading).toBe(false);
  });

  it("reloads the full details for the current range", async () => {
    vi.mocked(api.asset).mockResolvedValueOnce(details("1d", false)).mockResolvedValueOnce(details("1m", false));
    vi.mocked(api.history).mockResolvedValue({ symbol: "AI.PA", range: "1M", interval: "4h", timestamps: [10, 20], prices: [5, 6], cachedAt: 0, expiresAt: 0 });

    const { result, rerender } = renderHook(({ range }) => useAssetDetailData("AI.PA", range), { initialProps: { range: "1d" as "1d" | "1m" } });
    await waitFor(() => { expect(result.current.data).not.toBeNull(); });
    rerender({ range: "1m" });
    await waitFor(() => { expect(result.current.data?.chart?.timestamps).toEqual([10, 20]); });
    expect(api.positionPerformance).not.toHaveBeenCalled();

    await act(async () => { await result.current.reload(); });
    expect(api.asset).toHaveBeenLastCalledWith("AI.PA", "1m");
    expect(result.current.data?.chart?.range).toBe("1m");
  });

  it("falls back to the full details once when the partial range request fails", async () => {
    vi.mocked(api.asset).mockResolvedValueOnce(details("1d")).mockResolvedValueOnce(details("1m"));
    vi.mocked(api.history).mockRejectedValue(new Error("offline"));
    vi.mocked(api.positionPerformance).mockResolvedValue({ id: 7 } as never);

    const { result, rerender } = renderHook(({ range }) => useAssetDetailData("AI.PA", range), { initialProps: { range: "1d" as "1d" | "1m" } });
    await waitFor(() => { expect(result.current.data).not.toBeNull(); });
    rerender({ range: "1m" });

    await waitFor(() => { expect(result.current.data?.chart?.range).toBe("1m"); });
    expect(api.asset).toHaveBeenCalledTimes(2);
    expect(api.asset).toHaveBeenLastCalledWith("AI.PA", "1m");
    expect(result.current.error).toBeNull();
  });
});
