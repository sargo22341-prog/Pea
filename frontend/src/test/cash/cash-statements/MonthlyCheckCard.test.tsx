import type { CashAccountCheckDto, CashMonthCheck } from "@pea/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyContext } from "../../../contexts/privacy-context";
import { changeAppLanguage } from "../../../i18n";
import enCash from "../../../i18n/locales/en/cash.json";
import frCash from "../../../i18n/locales/fr/cash.json";
import { MonthlyCheckCard } from "../../../pages/pea/components/monthly-check/MonthlyCheckCard";

const cashMonthlyCheck = vi.fn<() => Promise<CashAccountCheckDto>>();

vi.mock("../../../lib/api", () => ({
  api: { cashMonthlyCheck: () => cashMonthlyCheck() }
}));

const noDocuments = { cashStatement: false, tradeNotices: 0, couponStatements: 0 };
const month = (period: string, status: CashMonthCheck["status"], extra: Partial<CashMonthCheck> = {}): CashMonthCheck => ({ period, status, issues: [], missingDocuments: noDocuments, ...extra });
const check: CashAccountCheckDto = {
  months: [
    month("2026-04", "missing", { missingDocuments: { ...noDocuments, cashStatement: true } }),
    month("2026-03", "mismatch", {
      closingDate: "2026-03-31", statementBalance: 13.06, appBalance: 4119.77, difference: 4106.71, monthDifference: 4100,
      missingDocuments: { cashStatement: false, tradeNotices: 1, couponStatements: 2 },
      issues: [
        { source: "statement_line", kind: "buy", date: "2026-03-17", amount: -3611.3, reference: "2026-03#7", label: "IS.MS.W.S.P.UC.EUR", missingDocument: "trade_notice" },
        { source: "app_entry", kind: "deposit", date: "2026-03-20", amount: 500, elementId: "movement:7" }
      ]
    }),
    month("2026-02", "ok", { closingDate: "2026-02-27", statementBalance: 20.28, appBalance: 20.28, difference: 0 })
  ],
  counts: { ok: 1, mismatch: 1, opening: 0, quiet: 0, missing: 1 }
};

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

function rowOf(period: string) {
  const row = screen.getByText(period).closest("tr");
  if (!row) throw new Error("ligne attendue");
  return row;
}

describe("contrôle mensuel du compte", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("lists the months to review first, then every month on demand", async () => {
    const user = userEvent.setup();
    cashMonthlyCheck.mockResolvedValue(check);
    render(<MonthlyCheckCard version="1" />);
    expect(await screen.findByText(/1 mois juste\(s\), 1 écart\(s\), 1 relevé\(s\) manquant\(s\)/)).toBeInTheDocument();
    expect(within(rowOf("03/2026")).getByText("Écart")).toBeInTheDocument();
    expect(within(rowOf("03/2026")).getByText(/\+4\s106,71/)).toBeInTheDocument();
    expect(within(rowOf("04/2026")).getByText("Relevé manquant")).toBeInTheDocument();
    expect(screen.queryByText("02/2026")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tous les mois" }));
    expect(within(rowOf("02/2026")).getByText("Solde juste")).toBeInTheDocument();
  });

  it("explains a mismatch: missing documents, statement lines and app operations", async () => {
    const user = userEvent.setup();
    cashMonthlyCheck.mockResolvedValue(check);
    render(<MonthlyCheckCard version="1" />);
    await user.click(within(await screen.findByText("03/2026").then((cell) => cell.closest("tr") as HTMLElement)).getByRole("button", { name: "Détail" }));
    expect(screen.getByText(/Écart apparu ce mois-ci : \+4\s100,00/)).toBeInTheDocument();
    expect(screen.getByText("1 avis d'opéré")).toBeInTheDocument();
    expect(screen.getByText("2 coupon(s) ou remboursement(s) sans relevé de coupons")).toBeInTheDocument();
    expect(screen.getByText(/Ligne 03\/2026 n° 7 du relevé, absente de l'application : avis d'opéré manquant/)).toBeInTheDocument();
    expect(screen.getByText(/IS\.MS\.W\.S\.P\.UC\.EUR/)).toBeInTheDocument();
    expect(screen.getByText(/absente du relevé \(doublon ou erreur probable\)/)).toBeInTheDocument();
  });

  it("masks every amount in privacy mode", async () => {
    const user = userEvent.setup();
    cashMonthlyCheck.mockResolvedValue(check);
    render(<PrivacyContext.Provider value={{ privacyEnabled: true }}><MonthlyCheckCard version="1" /></PrivacyContext.Provider>);
    const row = await screen.findByText("03/2026").then((cell) => cell.closest("tr") as HTMLElement);
    expect(within(row).getAllByText("••••")).toHaveLength(3);
    await user.click(within(row).getByRole("button", { name: "Détail" }));
    expect(screen.queryByText(/4\s100/)).not.toBeInTheDocument();
    expect(screen.queryByText(/3\s611/)).not.toBeInTheDocument();
  });

  it("invites to import statements when none is imported, in French and English", async () => {
    expect(keysOf(enCash.monthlyCheck).sort()).toEqual(keysOf(frCash.monthlyCheck).sort());
    cashMonthlyCheck.mockResolvedValue({ months: [], counts: { ok: 0, mismatch: 0, opening: 0, quiet: 0, missing: 0 } });
    const { unmount } = render(<MonthlyCheckCard version="1" />);
    expect(await screen.findByText(/Importez vos relevés espèces/)).toBeInTheDocument();
    unmount();
    await changeAppLanguage("en");
    try {
      cashMonthlyCheck.mockResolvedValue(check);
      render(<MonthlyCheckCard version="2" />);
      expect(await screen.findByText("Mismatch")).toBeInTheDocument();
      expect(screen.getByText("Missing statement")).toBeInTheDocument();
    } finally {
      await changeAppLanguage("fr");
    }
  });
});
