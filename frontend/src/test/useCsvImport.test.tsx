import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCsvImport } from "../pages/settings/hooks/useCsvImport";
import { api } from "../lib/api";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate
}));

vi.mock("../lib/api", () => ({
  api: {
    previewBoursorama: vi.fn(),
    previewBoursoramaUpdate: vi.fn(),
    confirmBoursorama: vi.fn(),
    confirmBoursoramaUpdate: vi.fn()
  }
}));

vi.mock("../lib/dataConstruction", () => ({
  notifyDataConstructionChanged: vi.fn()
}));

function csvFile(content: string) {
  return new File([content], "positions.csv", { type: "text/csv" });
}

function Probe() {
  const csv = useCsvImport();
  return (
    <div>
      <button type="button" onClick={() => void csv.importCsv(csvFile("ISIN;Nom\nFR0000120073;Air Liquide"))}>preview</button>
      <button type="button" onClick={() => void csv.confirmImport()}>confirm</button>
      <button type="button" onClick={() => csv.updateImportRow(0, { action: "replace" })}>replace</button>
      <span data-testid="loading">{String(csv.loading)}</span>
      <span data-testid="message">{csv.message ?? ""}</span>
      <span data-testid="rows">{csv.rows.length}</span>
      <span data-testid="row-action">{csv.rows[0]?.action ?? ""}</span>
      <span data-testid="row-errors">{csv.rows[0]?.errors.join("|") ?? ""}</span>
    </div>
  );
}

describe("useCsvImport", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads preview rows from a CSV file", async () => {
    vi.mocked(api.previewBoursorama).mockResolvedValue([
      {
        line: 2,
        isin: "FR0000120073",
        symbol: "AI.PA",
        name: "Air Liquide",
        quantity: 1,
        averageBuyPrice: 100,
        currency: "EUR",
        errors: []
      }
    ] as never);

    render(<Probe />);
    fireEvent.click(screen.getByText("preview"));

    await waitFor(() => expect(screen.getByTestId("rows").textContent).toBe("1"));
    expect(api.previewBoursorama).toHaveBeenCalledWith("ISIN;Nom\nFR0000120073;Air Liquide");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("confirms rows with merge as default action and navigates after a clean import", async () => {
    vi.mocked(api.previewBoursorama).mockResolvedValue([
      {
        line: 2,
        isin: "FR0000120073",
        symbol: "AI.PA",
        name: "Air Liquide",
        quantity: 1,
        averageBuyPrice: 100,
        currency: "EUR",
        errors: []
      }
    ] as never);
    vi.mocked(api.confirmBoursorama).mockResolvedValue({ imported: ["AI.PA"], skipped: [], errors: [] } as never);

    render(<Probe />);
    fireEvent.click(screen.getByText("preview"));
    await screen.findByText("1");
    fireEvent.click(screen.getByText("confirm"));

    await waitFor(() => expect(api.confirmBoursorama).toHaveBeenCalledTimes(1));
    expect(api.confirmBoursorama).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: "AI.PA", action: "merge" })
    ]);
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("keeps confirmation errors on matching rows without dropping existing validation errors", async () => {
    vi.mocked(api.previewBoursorama).mockResolvedValue([
      {
        line: 7,
        isin: "FR0000120073",
        symbol: "AI.PA",
        name: "Air Liquide",
        quantity: 1,
        averageBuyPrice: 100,
        currency: "EUR",
        errors: ["Prix manquant"]
      }
    ] as never);
    vi.mocked(api.confirmBoursorama).mockResolvedValue({
      imported: [],
      skipped: [],
      errors: [{ line: 7, message: "Yahoo indisponible" }]
    } as never);

    render(<Probe />);
    fireEvent.click(screen.getByText("preview"));
    await screen.findByText("1");
    fireEvent.click(screen.getByText("replace"));
    fireEvent.click(screen.getByText("confirm"));

    await waitFor(() => expect(screen.getByTestId("row-errors").textContent).toContain("Confirmation: Yahoo indisponible"));
    expect(screen.getByTestId("row-errors").textContent).toContain("Prix manquant");
    expect(api.confirmBoursorama).toHaveBeenCalledWith([
      expect.objectContaining({ action: "replace" })
    ]);
    expect(navigate).not.toHaveBeenCalled();
  });
});

