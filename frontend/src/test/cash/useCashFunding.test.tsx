import type { CashFundingInput } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCashFunding } from "../../components/common/cash/useCashFunding";
import { ApiError } from "../../lib/api-core";

function insufficientFunds(fundable = true) {
  return new ApiError(422, "Solde especes insuffisant.", {
    details: { code: "INSUFFICIENT_FUNDS", available: 300, required: 502, shortfall: 202, effectiveAt: "2026-01-05T10:00:00.000Z", fundable }
  });
}

function Probe({ action, onError = vi.fn() }: { action: (funding?: CashFundingInput) => Promise<void>; onError?: (error: unknown) => void }) {
  const funding = useCashFunding(onError);
  return (
    <div>
      <button onClick={() => void funding.run(action)} type="button">save</button>
      {funding.dialog}
    </div>
  );
}

function compact(text: string | null | undefined) {
  return (text ?? "").replace(/\s/g, "");
}

describe("useCashFunding", () => {
  it("shows the available balance, the cost and the missing amount, prefilled as deposit", async () => {
    const action = vi.fn<(funding?: CashFundingInput) => Promise<void>>().mockRejectedValueOnce(insufficientFunds()).mockResolvedValueOnce(undefined);
    render(<Probe action={action} />);

    fireEvent.click(screen.getByText("save"));
    await screen.findByRole("dialog");
    expect(compact(screen.getByTestId("funding-available").textContent)).toBe("300,00€");
    expect(compact(screen.getByTestId("funding-shortfall").textContent)).toBe("202,00€");
    expect(screen.getByLabelText("Montant du versement")).toHaveValue(202);

    fireEvent.change(screen.getByLabelText("Montant du versement"), { target: { value: "250" } });
    fireEvent.click(screen.getByText("Confirmer le versement et l'opération"));

    await waitFor(() => { expect(action).toHaveBeenCalledTimes(2); });
    expect(action).toHaveBeenLastCalledWith({ amount: 250 });
    await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
  });

  it("never records a deposit when the user cancels", async () => {
    const action = vi.fn<(funding?: CashFundingInput) => Promise<void>>().mockRejectedValue(insufficientFunds());
    render(<Probe action={action} />);

    fireEvent.click(screen.getByText("save"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByText("Annuler ou corriger"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith();
  });

  it("refuses a deposit below the missing amount", async () => {
    const action = vi.fn<(funding?: CashFundingInput) => Promise<void>>().mockRejectedValue(insufficientFunds());
    render(<Probe action={action} />);

    fireEvent.click(screen.getByText("save"));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Montant du versement"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("Confirmer le versement et l'opération"));

    expect(await screen.findByText(/Le versement doit couvrir au moins/)).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("only explains the refusal when a deposit cannot fund the operation", async () => {
    const action = vi.fn<(funding?: CashFundingInput) => Promise<void>>().mockRejectedValue(insufficientFunds(false));
    render(<Probe action={action} />);

    fireEvent.click(screen.getByText("save"));
    await screen.findByRole("dialog");

    expect(screen.queryByLabelText("Montant du versement")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmer le versement et l'opération")).not.toBeInTheDocument();
  });

  it("forwards other errors without opening the dialog", async () => {
    const onError = vi.fn();
    const failure = new ApiError(400, "Données invalides");
    render(<Probe action={() => Promise.reject(failure)} onError={onError} />);

    fireEvent.click(screen.getByText("save"));

    await waitFor(() => { expect(onError).toHaveBeenCalledWith(failure); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
