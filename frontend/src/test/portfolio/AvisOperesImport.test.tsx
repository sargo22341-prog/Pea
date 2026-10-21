import type { CashFundingInput, ParsedAvisOperation, TradeImportResult } from "@pea/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportAvisOperesPdf } from "../../pages/settings/components/ImportAvisOperesPdf";

const previewAvisOperesPdf = vi.fn<(files: File[]) => Promise<ParsedAvisOperation[]>>();
const confirmAvisOperesPdf = vi.fn<(rows: ParsedAvisOperation[], funding?: CashFundingInput) => Promise<TradeImportResult>>();

vi.mock("../../lib/api", () => ({
  api: {
    previewAvisOperesPdf: (files: File[]) => previewAvisOperesPdf(files),
    confirmAvisOperesPdf: (rows: ParsedAvisOperation[], funding?: CashFundingInput) => confirmAvisOperesPdf(rows, funding)
  }
}));

const operation = (id: string, extra: Partial<ParsedAvisOperation> = {}): ParsedAvisOperation => ({
  id, dateExecution: "2026-09-15T10:33:37", nomValeur: "DANONE", quantite: 2, sensOperation: "achat", coursExecute: 60.1, montantTotalFrais: 0.48,
  devise: "EUR", sourceFileName: `${id}.pdf`, reference: id, warnings: [], selectedSymbol: "BN.PA", ...extra
});

async function loadPreview(user: ReturnType<typeof userEvent.setup>, rows: ParsedAvisOperation[]) {
  previewAvisOperesPdf.mockResolvedValue(rows);
  render(<ImportAvisOperesPdf />);
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("champ fichier attendu");
  await user.upload(input, new File(["%PDF-"], "avis.pdf", { type: "application/pdf" }));
  await screen.findAllByRole("checkbox");
}

describe("import des avis d'opéré", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("garde décoché l'avis déjà enregistré proposé à l'ignorance par le serveur", async () => {
    const user = userEvent.setup();
    confirmAvisOperesPdf.mockResolvedValue({ imported: ["BN.PA"], skipped: [], linked: ["DANONE"], errors: [] });
    await loadPreview(user, [
      operation("new", { action: "import" }),
      operation("known", { action: "ignore", potentialDuplicate: true, warnings: ["Doublon possible."] })
    ]);

    const [fresh, known] = screen.getAllByRole("checkbox");
    expect(fresh).toBeChecked();
    expect(known).not.toBeChecked();
    expect(screen.getByText("Importer quand meme (doublon)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Valider l'import PDF" }));

    await waitFor(() => { expect(confirmAvisOperesPdf).toHaveBeenCalledTimes(1); });
    const sent = confirmAvisOperesPdf.mock.calls[0]?.[0] ?? [];
    expect(sent.map((row) => row.action)).toEqual(["import", "ignore"]);
    expect(sent[1]?.confirmDuplicate).toBeFalsy();
    expect(await screen.findByText(/1 deja enregistree\(s\) et completee\(s\)/)).toBeInTheDocument();
  });

  it("cocher un doublon signalé vaut confirmation explicite de le créer", async () => {
    const user = userEvent.setup();
    confirmAvisOperesPdf.mockResolvedValue({ imported: ["BN.PA"], skipped: [], linked: [], errors: [] });
    await loadPreview(user, [operation("known", { action: "ignore", potentialDuplicate: true })]);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Valider l'import PDF" }));

    await waitFor(() => { expect(confirmAvisOperesPdf).toHaveBeenCalledTimes(1); });
    expect(confirmAvisOperesPdf.mock.calls[0]?.[0][0]).toMatchObject({ action: "import", confirmDuplicate: true });
  });
});
