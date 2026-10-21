import type { CashStatementLinePreview, CashStatementsConfirmInput, CashStatementsPreviewDto } from "@pea/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../../contexts/privacy-context";
import { CashStatementsImport } from "../../../pages/settings/components/cash-statements/CashStatementsImport";

const previewCashStatements = vi.fn<(files: readonly File[]) => Promise<CashStatementsPreviewDto>>();
const confirmCashStatements = vi.fn<(files: readonly File[], decisions: CashStatementsConfirmInput) => Promise<unknown>>();

vi.mock("../../../lib/api", () => ({
  api: {
    previewCashStatements: (files: readonly File[]) => previewCashStatements(files),
    confirmCashStatements: (files: readonly File[], decisions: CashStatementsConfirmInput) => confirmCashStatements(files, decisions)
  }
}));

const line = (lineNo: number, kind: CashStatementLinePreview["kind"], lineCase: CashStatementLinePreview["case"], amount: number, extra: Partial<CashStatementLinePreview> = {}): CashStatementLinePreview => ({
  lineNo, key: `2026-03#${String(lineNo)}`, kind, case: lineCase, amount, label: "LIBELLE", operationDate: "2026-03-05", beforeStart: false, ...extra
});
const target = (id: string, effectiveAt: string) => ({ id, kind: "deposit" as const, effectiveAt, amount: 2000 });

const preview: CashStatementsPreviewDto = {
  statements: [
    {
      fileName: "mars.pdf", period: "2026-03", format: "current", openingDate: "2026-02-27", closingDate: "2026-03-31", openingBalance: 20.28, closingBalance: 13.06,
      continuity: { status: "gap", previousPeriod: "2025-12", missingPeriods: ["2026-01", "2026-02"], balanceMatches: false },
      lines: [
        line(1, "dividend", "verify", 164.96, { name: "TOTALENERGIES SE", quantity: 296, target: { id: "movement:4", kind: "dividend", effectiveAt: "2026-03-05T12:00:00.000Z", amount: 164.96, symbol: "TTE.PA" } }),
        line(2, "deposit", "ambiguous", 2000, { candidates: [target("movement:7", "2026-03-16T08:00:00.000Z"), target("movement:8", "2026-03-17T08:00:00.000Z")] }),
        line(3, "dividend", "create", 4.59, { name: "AIR LIQUIDE", quantity: 4 }),
        line(4, "deposit", "create", 2000),
        line(5, "buy", "missing_trade", -3611.3, { name: "IS.MS.W.S.P.UC.EUR", quantity: 292 }),
        line(6, "sell", "already_verified", 1312.5, { name: "LEGRAND", quantity: 12 })
      ]
    },
    { fileName: "faux.pdf", error: "Relevé incohérent : l'ancien solde et les opérations ne donnent pas le nouveau solde.", lines: [] }
  ],
  positions: [{ id: 21, symbol: "AI.PA", name: "Air Liquide" }]
};

async function loadPreview(user: ReturnType<typeof userEvent.setup>) {
  previewCashStatements.mockResolvedValue(preview);
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("champ fichier attendu");
  await user.upload(input, [new File(["%PDF-"], "mars.pdf", { type: "application/pdf" })]);
  await screen.findByText("Relevé espèces 03/2026");
}

describe("import des relevés espèces", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("shows each statement with its continuity, the matching proposals and the missing documents, without writing", async () => {
    const user = userEvent.setup();
    render(<CashStatementsImport />);
    await loadPreview(user);
    expect(screen.getByText(/Ancien solde 20,28\s€ au .* nouveau solde 13,06\s€/)).toBeInTheDocument();
    expect(screen.getByText("Relevé manquant pour 01/2026, 02/2026 : le solde ne se suit pas depuis le relevé 12/2025.")).toBeInTheDocument();
    expect(screen.getByText("Retrouvé dans l'application : il sera vérifié.")).toBeInTheDocument();
    expect(screen.getByText(/Avis d'opéré manquant : importez-le/)).toBeInTheDocument();
    expect(screen.getByText(/Coupon absent de l'application : choisissez la position/)).toBeInTheDocument();
    expect(screen.getByText(/Relevé refusé, rien n'en sera importé : Relevé incohérent/)).toBeInTheDocument();
    expect(screen.queryByText("Déjà vérifié.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Afficher toutes les lignes" }));
    expect(screen.getByText("Déjà vérifié.")).toBeInTheDocument();
    expect(confirmCashStatements).not.toHaveBeenCalled();
  });

  it("verifies and creates by default, but waits for an explicit choice on ambiguities and coupons", async () => {
    const user = userEvent.setup();
    confirmCashStatements.mockResolvedValue({ statements: 1, verified: 2, created: 2, alreadyVerified: 1, unmatched: 1, errors: [] });
    render(<CashStatementsImport />);
    await loadPreview(user);
    const boxes = screen.getAllByRole("checkbox", { name: "Appliquer" });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false, false, true]);
    expect(boxes[1]).toBeDisabled();
    expect(boxes[2]).toBeDisabled();

    await user.selectOptions(screen.getByRole("combobox", { name: "Opération correspondante" }), "movement:8");
    await user.selectOptions(screen.getByRole("combobox", { name: "Position" }), "21");
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => { expect(confirmCashStatements).toHaveBeenCalledTimes(1); });
    expect(confirmCashStatements.mock.calls[0]?.[1].lines).toEqual(expect.arrayContaining([
      { key: "2026-03#1", apply: true, targetId: undefined, positionId: undefined },
      { key: "2026-03#2", apply: true, targetId: "movement:8", positionId: undefined },
      { key: "2026-03#3", apply: true, targetId: undefined, positionId: 21 },
      { key: "2026-03#4", apply: true, targetId: undefined, positionId: undefined }
    ]));
    expect(await screen.findByText(/1 relevé\(s\) enregistré\(s\), 2 opération\(s\) vérifiée\(s\), 2 créée\(s\)/)).toBeInTheDocument();
  });

  it("hides amounts in privacy mode", async () => {
    const user = userEvent.setup();
    render(<PrivacyContext.Provider value={{ privacyEnabled: true }}><CashStatementsImport /></PrivacyContext.Provider>);
    await loadPreview(user);
    expect(screen.queryByText(/164,96/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20,28/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/••••/).length).toBeGreaterThan(0);
  });
});
