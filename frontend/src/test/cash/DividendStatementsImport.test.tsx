import type { DividendStatementLinePreview, DividendStatementsConfirmInput, DividendStatementsPreviewDto } from "@pea/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DividendStatementsImport } from "../../pages/settings/components/DividendStatementsImport";

const previewDividendStatements = vi.fn<(files: readonly File[]) => Promise<DividendStatementsPreviewDto>>();
const confirmDividendStatements = vi.fn<(files: readonly File[], decisions: DividendStatementsConfirmInput) => Promise<unknown>>();

vi.mock("../../lib/api", () => ({
  api: {
    previewDividendStatements: (files: readonly File[]) => previewDividendStatements(files),
    confirmDividendStatements: (files: readonly File[], decisions: DividendStatementsConfirmInput) => confirmDividendStatements(files, decisions)
  }
}));

const line = (lineNo: number, name: string, lineCase: DividendStatementLinePreview["case"], extra: Partial<DividendStatementLinePreview> = {}): DividendStatementLinePreview => ({
  lineNo, key: `2026-05#${String(lineNo)}`, case: lineCase, paymentDate: "2026-05-04", name, isin: "FR0000120644", gross: 8.4, withholding: 0, netFiscal: 8.4, commission: 0, net: 8.4, ...extra
});

const preview: DividendStatementsPreviewDto = {
  statements: [
    {
      fileName: "mai.pdf",
      period: "2026-05",
      totalNet: 33.6,
      refunds: [{ paymentDate: "2026-05-05", name: "ENGIE", isin: "FR0010208488", amount: 51.04 }],
      lines: [
        line(1, "DANONE", "create"),
        line(2, "VEOLIA", "unknown_asset", { isin: "FR0000124141" }),
        line(3, "FDJ", "mismatch", { movement: { id: 9, amount: 70, effectiveAt: "2026-04-27T09:00:00.000Z" } }),
        line(4, "TOTALENERGIES", "already_certified", { movement: { id: 3, amount: 8.4, effectiveAt: "2026-05-04T12:00:00.000Z", verification: { status: "document", verifiedAt: "2026-10-20T12:00:00.000Z", reference: "2026-05#4" } } })
      ]
    },
    { fileName: "illisible.pdf", error: "Relevé incohérent : la somme des lignes ne correspond pas aux totaux.", lines: [], refunds: [], totalNet: 0 }
  ],
  opening: { referenceAt: "2026-03-01T00:00:00.000Z", certifiable: 262.67, declared: 250 },
  positions: [{ id: 11, symbol: "VIE.PA", name: "Veolia" }, { id: 12, symbol: "TTE.PA", name: "TotalEnergies", isin: "FR0000120271" }]
};

async function loadPreview(user: ReturnType<typeof userEvent.setup>) {
  previewDividendStatements.mockResolvedValue(preview);
  render(<DividendStatementsImport />);
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("champ fichier attendu");
  await user.upload(input, [new File(["%PDF-"], "mai.pdf", { type: "application/pdf" }), new File(["%PDF-"], "illisible.pdf", { type: "application/pdf" })]);
  await screen.findByText("Relevé 05/2026");
}

describe("import des relevés de coupons", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("groups the preview by statement and case, without writing anything", async () => {
    const user = userEvent.setup();
    await loadPreview(user);
    for (const title of ["Dividendes à ajouter", "Actif à choisir", "Écarts à corriger", "Déjà certifiés"]) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(/Enregistré avec 70,00\s€ le .* corrigé avec les valeurs du relevé/)).toBeInTheDocument();
    expect(screen.getByText(/Remboursement de 51,04\s€ ENGIE : signalé, non importé/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Relevé refusé, rien n'en sera importé : Relevé incohérent");
    expect(screen.getByText(/262,67\s€ au total\. Montant confirmé : 250,00\s€ \(écart \+12,67\s€\)/)).toBeInTheDocument();
    expect(screen.getByText("Certifié par relevé")).toBeInTheDocument();
    expect(confirmDividendStatements).not.toHaveBeenCalled();
  });

  it("applies safe lines by default and requires explicit choices for corrections and unknown assets", async () => {
    const user = userEvent.setup();
    confirmDividendStatements.mockResolvedValue({ certified: 0, corrected: 1, created: 2, alreadyCertified: 1, skipped: 0, openingCertified: true, errors: [] });
    await loadPreview(user);
    // Ordre d'affichage par cas : écart à corriger, dividende à ajouter, actif à choisir.
    const checkboxes = screen.getAllByRole("checkbox", { name: "Appliquer" });
    expect(checkboxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, true, false]);
    expect(checkboxes[2]).toBeDisabled();

    const select = screen.getByRole("combobox", { name: "Position" });
    expect(within(select).queryByText(/TTE\.PA/)).not.toBeInTheDocument();
    await user.selectOptions(select, "11");
    const [mismatchBox] = checkboxes;
    if (!mismatchBox) throw new Error("case à cocher attendue");
    await user.click(mismatchBox);
    await user.click(screen.getByRole("checkbox", { name: "Certifier ce montant comme dividendes déjà perçus" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => { expect(confirmDividendStatements).toHaveBeenCalled(); });
    const [files, decisions] = confirmDividendStatements.mock.calls[0] ?? [];
    expect(files).toHaveLength(2);
    expect(decisions).toEqual({
      lines: [
        { key: "2026-05#1", apply: true, positionId: undefined },
        { key: "2026-05#2", apply: true, positionId: 11 },
        { key: "2026-05#3", apply: true, positionId: undefined }
      ],
      certifyOpening: true
    });
    expect(await screen.findByText(/0 certifié\(s\), 1 corrigé\(s\), 2 ajouté\(s\), 1 déjà certifié\(s\)/)).toBeInTheDocument();
    expect(screen.getByText("Dividendes déjà perçus certifiés.")).toBeInTheDocument();
  });
});
