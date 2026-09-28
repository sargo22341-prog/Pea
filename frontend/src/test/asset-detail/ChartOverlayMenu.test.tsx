import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChartOverlayMenu } from "../../pages/asset-detail/components/ChartOverlayMenu";
import { useChartOverlays } from "../../pages/asset-detail/hooks/useChartOverlays";

function Harness() {
  const { overlays, toggleOverlay } = useChartOverlays();
  return (
    <>
      <ChartOverlayMenu onToggle={toggleOverlay} selected={overlays} />
      <output>{overlays.join(",")}</output>
    </>
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("chart overlay menu", () => {
  it("toggles moving averages and remembers the choice in this browser", () => {
    const { unmount } = render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Calques du graphique" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /MM200/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /MM50/ }));
    expect(screen.getByRole("status")).toHaveTextContent("ma50,ma200");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    unmount();

    render(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent("ma50,ma200");
  });

  it("ignores unknown stored overlays", () => {
    window.localStorage.setItem("pea.chart.overlays", "rsi,ma200");
    render(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent(/^ma200$/);
  });
});
