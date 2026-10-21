import type { CashAccountSummary, CashLedgerDto, CashLedgerEntry, DividendStatementRefundPreview } from "@pea/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../contexts/privacy-context";
import { enResources } from "../../i18n/resources-en";
import { CashMovementForm } from "../../pages/pea/components/CashMovementForm";
import { LedgerTable } from "../../pages/pea/components/LedgerTable";
import { DividendStatementRefundLine } from "../../pages/settings/components/DividendStatementRefundLine";

const createCashMovement = vi.fn<(input: unknown) => Promise<CashLedgerDto>>();

vi.mock("../../lib/api", () => ({
  api: { createCashMovement: (input: unknown) => createCashMovement(input) }
}));

const summary: CashAccountSummary = {
  status: "ready", cash: 1126.78, deposits: 1000, withdrawals: 0, netDeposits: 1000, cashDividends: 0, otherCredits: 126.78,
  standaloneFees: 0, depositCeiling: 150_000, remainingCeiling: 149_000, realizedGain: 0, historyIncomplete: false
};

const entry = (id: string, kind: CashLedgerEntry["kind"], amount: number, extra: Partial<CashLedgerEntry> = {}): CashLedgerEntry => ({
  id, kind, effectiveAt: "2026-05-06T12:00:00.000Z", amount, balanceAfter: 0, absorbed: false, source: "manual", ...extra
});

const ledger: CashLedgerDto = {
  summary,
  settings: { status: "ready", openingCash: 0, openingDeposits: 0, openingWithdrawals: 0 },
  entries: [
    entry("movement:3", "compensation", 65.53, { note: "Rompus AIR LIQUIDE" }),
    entry("movement:2", "capital_repayment", 61.25, { symbol: "ENGI.PA", verification: { status: "document", verifiedAt: "2026-10-20T12:00:00.000Z", reference: "2026-05#R1" } }),
    entry("movement:1", "deposit", 1000)
  ]
};

const refund = (extra: Partial<DividendStatementRefundPreview>): DividendStatementRefundPreview => ({
  lineNo: 1, key: "2026-05#R1", case: "create", beforeStart: false, paymentDate: "2026-05-05", name: "ENGIE", isin: "FR0010208488", quantity: 160, gross: 51.04, amount: 51.04, ...extra
});

describe("remboursements de capital et indemnisations", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("records a capital repayment with an optional asset, without deposit warning", async () => {
    const user = userEvent.setup();
    createCashMovement.mockResolvedValue(ledger);
    render(<CashMovementForm assets={[{ positionId: 7, symbol: "ENGI.PA", name: "Engie" }]} onSaved={vi.fn()} summary={summary} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "capital_repayment");
    expect(screen.getByText(/ni un versement ni un dividende/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Actif concerné (facultatif)" }), "7");
    await user.type(screen.getByRole("spinbutton"), "61.25");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(createCashMovement).toHaveBeenCalledWith(expect.objectContaining({ type: "capital_repayment", amount: 61.25, positionId: 7 }));
  });

  it("filters the history by credit type and shows the statement badge", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LedgerTable ledger={ledger} onChanged={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Remboursement de capital" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("ENGI.PA")).toBeInTheDocument();
    expect(screen.getByText("Certifié par relevé")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Indemnisation" }));
    expect(screen.getByText("Rompus AIR LIQUIDE")).toBeInTheDocument();
    expect(screen.queryByText("ENGI.PA")).not.toBeInTheDocument();
  });

  it("requires an explicit choice for an ambiguous refund and masks amounts in private mode", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const candidates = [{ id: 4, amount: 51.04, effectiveAt: "2026-05-05T09:00:00.000Z" }, { id: 5, amount: 51.04, effectiveAt: "2026-05-06T09:00:00.000Z" }];
    render(
      <PrivacyContext.Provider value={{ privacyEnabled: true }}>
        <ul><DividendStatementRefundLine choice={{ apply: false }} onChoose={onChoose} refund={refund({ case: "ambiguous", candidates, beforeStart: true })} /></ul>
      </PrivacyContext.Provider>
    );
    expect(screen.getByRole("checkbox", { name: "Appliquer" })).toBeDisabled();
    expect(screen.getByText(/Plusieurs remboursements enregistrés correspondent/)).toBeInTheDocument();
    expect(screen.getByText(/Antérieur à l'état initial/)).toBeInTheDocument();
    expect(screen.queryByText(/51,04/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Remboursement enregistré" }), "5");
    expect(onChoose).toHaveBeenCalledWith({ apply: true, movementId: 5 });
  });

  it("warns about a possible duplicate and translates the new types", () => {
    render(<ul><DividendStatementRefundLine choice={{ apply: false }} onChoose={vi.fn()} refund={refund({ possibleDuplicate: true })} /></ul>);
    expect(screen.getByText(/Un remboursement d'un autre montant existe/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Appliquer" })).not.toBeChecked();
    const { kinds, overview } = enResources.cash;
    expect([kinds.capital_repayment, kinds.compensation, overview.otherCredits]).toEqual(["Capital repayment", "Compensation", "Other credits"]);
  });
});
