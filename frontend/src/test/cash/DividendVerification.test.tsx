import type { DividendStatementCheck } from "@pea/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DividendVerificationPanel } from "../../components/common/cash/verification/DividendVerificationPanel";

const verifyDividend = vi.fn();
const checkDividendStatement = vi.fn<(id: number, file: File) => Promise<DividendStatementCheck>>();
const certifyDividendStatement = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    verifyDividend: (id: number) => verifyDividend(id) as unknown,
    checkDividendStatement: (id: number, file: File) => checkDividendStatement(id, file),
    certifyDividendStatement: (id: number, file: File, correct: boolean) => certifyDividendStatement(id, file, correct) as unknown
  }
}));

const statementFile = new File(["%PDF-"], "releve.pdf", { type: "application/pdf" });
const line = { lineNo: 2, paymentDate: "2026-04-28", name: "FDJ", isin: "FR0013451333", gross: 11.9, withholding: 0, netFiscal: 11.9, commission: 0, net: 11.9 };
const check = (outcome: DividendStatementCheck["outcome"], withLine = true): DividendStatementCheck => ({
  outcome, period: "2026-04", expected: { amount: 12.4, effectiveAt: "2026-04-28T12:00:00.000Z" }, match: withLine ? line : undefined, found: withLine ? [line] : []
});

async function attach(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("champ fichier attendu");
  await user.upload(input, statementFile);
}

describe("vérification d'un dividende", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("explains certified versus manual and records a manual verification", async () => {
    const user = userEvent.setup();
    verifyDividend.mockResolvedValue({ entries: [] });
    const onChanged = vi.fn();
    render(<DividendVerificationPanel movementId={5} onChanged={onChanged} />);
    expect(screen.getByText("Non vérifié")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Certifié ou vérifié : quelle différence ?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Marquer comme vérifié" }));
    await waitFor(() => { expect(onChanged).toHaveBeenCalled(); });
    expect(verifyDividend).toHaveBeenCalledWith(5);
  });

  it("hides manual verification on a certified dividend", () => {
    render(<DividendVerificationPanel movementId={5} verification={{ status: "document", verifiedAt: "2026-10-20T12:00:00.000Z", reference: "2026-04#2" }} />);
    expect(screen.getByText("Certifié par relevé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marquer comme vérifié" })).not.toBeInTheDocument();
  });

  it("warns precisely on a different amount and writes nothing until the correction is confirmed", async () => {
    const user = userEvent.setup();
    checkDividendStatement.mockResolvedValue(check("amount_mismatch"));
    certifyDividendStatement.mockResolvedValue({ entries: [] });
    render(<DividendVerificationPanel movementId={5} />);
    await attach(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Montant différent : 12,40\s€ attendus, 11,90\s€ sur le relevé\./);
    expect(screen.getByText(/FDJ · 11,90\s€ net/)).toBeInTheDocument();
    expect(checkDividendStatement).toHaveBeenCalledWith(5, statementFile);
    expect(certifyDividendStatement).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Corriger avec le relevé et certifier" }));
    await waitFor(() => { expect(certifyDividendStatement).toHaveBeenCalledWith(5, statementFile, true); });
  });

  it("reports a statement from another month or without the dividend, without any action", async () => {
    const user = userEvent.setup();
    checkDividendStatement.mockResolvedValueOnce(check("other_month", false));
    render(<DividendVerificationPanel movementId={5} />);
    await attach(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Relevé d'un autre mois (04/2026)");
    expect(screen.getByText("Aucune ligne pour cet actif sur ce relevé.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /certifier/i })).not.toBeInTheDocument();

    checkDividendStatement.mockResolvedValueOnce(check("not_found", false));
    await attach(user);
    expect(await screen.findByText("Ce relevé ne contient pas ce dividende à cette date.")).toBeInTheDocument();
  });

  it("certifies a matching dividend after confirmation", async () => {
    const user = userEvent.setup();
    checkDividendStatement.mockResolvedValue(check("match"));
    certifyDividendStatement.mockResolvedValue({ entries: [] });
    render(<DividendVerificationPanel movementId={5} />);
    await attach(user);
    await user.click(await screen.findByRole("button", { name: "Certifier" }));
    await waitFor(() => { expect(certifyDividendStatement).toHaveBeenCalledWith(5, statementFile, false); });
  });
});
