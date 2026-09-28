import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagsSection } from "../../pages/admin/components/FeatureFlagsSection";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: { featureFlags: vi.fn(), updateFeatureFlags: vi.fn() }
}));

const flags = [
  { key: "extended_fundamentals", enabled: true, defaultEnabled: true },
  { key: "insights", enabled: false, defaultEnabled: false, updatedAt: "2026-09-01T10:00:00.000Z", updatedBy: "admin" }
] as const;

describe("FeatureFlagsSection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("toggles a feature, reloads the flags and notifies the app", async () => {
    vi.mocked(api.featureFlags)
      .mockResolvedValueOnce([...flags])
      .mockResolvedValue([flags[0], { ...flags[1], enabled: true }]);
    vi.mocked(api.updateFeatureFlags).mockResolvedValue([]);
    const onChanged = vi.fn().mockResolvedValue(undefined);

    render(<FeatureFlagsSection onChanged={onChanged} open />);

    const insights = await screen.findByRole("switch", { name: "Signaux techniques" });
    expect(insights).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Active par defaut")).toBeInTheDocument();
    expect(screen.getByText(/par admin/)).toBeInTheDocument();

    fireEvent.click(insights);

    await waitFor(() => { expect(api.updateFeatureFlags).toHaveBeenCalledWith({ insights: true }); });
    await waitFor(() => { expect(screen.getByRole("switch", { name: "Signaux techniques" })).toHaveAttribute("aria-checked", "true"); });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows the server error when saving fails", async () => {
    vi.mocked(api.featureFlags).mockResolvedValue([...flags]);
    vi.mocked(api.updateFeatureFlags).mockRejectedValue(new Error("Droits administrateur requis."));

    render(<FeatureFlagsSection open />);
    fireEvent.click(await screen.findByRole("switch", { name: "Fondamentaux etendus" }));

    expect(await screen.findByText("Droits administrateur requis.")).toBeInTheDocument();
  });
});
