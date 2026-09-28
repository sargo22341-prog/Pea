import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdvancedModeContext } from "../../components/common/disclosure/advanced-mode";
import { DetailsToggle } from "../../components/common/disclosure/DetailsToggle";
import { InfoHint } from "../../components/common/disclosure/InfoHint";
import { SegmentedTabs } from "../../components/common/disclosure/SegmentedTabs";
import { MetricGrid } from "../../components/common/metrics/MetricGrid";

afterEach(() => {
  window.localStorage.clear();
});

describe("DetailsToggle", () => {
  it("stays collapsed by default and remembers the reader's choice", () => {
    const { unmount } = render(<DetailsToggle label="Voir les ratios" storageKey="test">detail</DetailsToggle>);
    const button = screen.getByRole("button", { name: /voir les ratios/i });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("detail")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByText("detail")).toBeInTheDocument();
    expect(window.localStorage.getItem("pea.details.test")).toBe("true");

    unmount();
    render(<DetailsToggle storageKey="test">detail</DetailsToggle>);
    expect(screen.getByText("detail")).toBeInTheDocument();
  });

  it("opens by default in advanced mode unless the reader closed it", () => {
    const { unmount } = render(
      <AdvancedModeContext value>
        <DetailsToggle storageKey="advanced">detail</DetailsToggle>
      </AdvancedModeContext>
    );
    expect(screen.getByText("detail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /masquer/i }));
    unmount();

    render(
      <AdvancedModeContext value>
        <DetailsToggle storageKey="advanced">detail</DetailsToggle>
      </AdvancedModeContext>
    );
    expect(screen.queryByText("detail")).not.toBeInTheDocument();
  });
});

describe("InfoHint", () => {
  it("shows its explanation on keyboard focus and closes with Escape", () => {
    render(<InfoHint label="PER">Cours divise par le benefice</InfoHint>);
    const trigger = screen.getByRole("button", { name: "PER" });

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Cours divise par le benefice");
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("MetricGrid", () => {
  it("hides missing indicators and the whole grid under the minimum", () => {
    const { rerender, container } = render(
      <MetricGrid items={[{ key: "a", label: "PER", value: "12" }, { key: "b", label: "P/B", value: undefined }, { key: "c", label: "BPA", value: "3 EUR" }]} />
    );
    expect(screen.getByText("PER")).toBeInTheDocument();
    expect(screen.queryByText("P/B")).not.toBeInTheDocument();

    rerender(<MetricGrid items={[{ key: "a", label: "PER", value: "12" }, { key: "b", label: "P/B", value: undefined }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SegmentedTabs", () => {
  it("marks the selected option and reports changes", () => {
    const selected: string[] = [];
    render(
      <SegmentedTabs
        ariaLabel="Periode"
        onChange={(value) => { selected.push(value); }}
        options={[{ value: "annual", label: "Annuel" }, { value: "quarterly", label: "Trimestriel" }]}
        value="annual"
      />
    );

    expect(screen.getByRole("tab", { name: "Annuel" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Trimestriel" }));
    expect(selected).toEqual(["quarterly"]);
  });
});
