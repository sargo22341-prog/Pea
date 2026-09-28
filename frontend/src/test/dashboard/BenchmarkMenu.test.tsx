import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BenchmarkMenu } from "../../pages/dashboard/components/evolution/BenchmarkMenu";
import { DEFAULT_BENCHMARKS, isBenchmark } from "../../pages/dashboard/components/evolution/benchmarks";

describe("BenchmarkMenu", () => {
  it("offers the default indices, none of them active by default", () => {
    const onToggle = vi.fn();
    render(<BenchmarkMenu onToggle={onToggle} selected={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Comparer a un indice" }));
    const cac = screen.getByRole("menuitemcheckbox", { name: "CAC 40" });
    expect(cac).not.toBeChecked();
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(DEFAULT_BENCHMARKS.length);

    fireEvent.click(cac);
    expect(onToggle).toHaveBeenCalledWith({ symbol: "^FCHI", name: "CAC 40" });
  });

  it("keeps active indices removable but blocks new ones once the comparison is full", () => {
    const selected = [
      { symbol: "^FCHI", name: "CAC 40" },
      { symbol: "MC.PA", name: "LVMH" },
      { symbol: "AI.PA", name: "Air Liquide" },
      { symbol: "OR.PA", name: "Oreal" }
    ];
    render(<BenchmarkMenu onToggle={vi.fn()} selected={selected} />);

    fireEvent.click(screen.getByRole("button", { name: "Comparer a un indice" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "CAC 40" })).toBeEnabled();
    expect(screen.getByRole("menuitemcheckbox", { name: "Euro Stoxx 50" })).toBeDisabled();
  });

  it("recognises benchmark symbols only", () => {
    expect(isBenchmark("^STOXX50E")).toBe(true);
    expect(isBenchmark("MC.PA")).toBe(false);
  });
});
