import type { ObjectiveDto, User } from "@pea/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectivePage } from "../pages/objectives/ObjectivePage";

const user: User = {
  id: 1,
  username: "alice",
  role: "user",
  defaultChartRange: "1d",
  projectionEndAge: 90,
  assetNewsEnabled: true,
  localPeaSearchEnabled: true,
  newsLanguages: ["fr"],
  language: "fr",
  dashboardDefaultSortKey: "name",
  dashboardDefaultSortDirection: "asc",
  watchlistDefaultSortKey: "name",
  watchlistDefaultSortDirection: "asc",
  privacyModeEnabled: false,
  createdAt: "2026-05-20T00:00:00.000Z"
};

function objective(overrides: Partial<ObjectiveDto> = {}): ObjectiveDto {
  return {
    id: "1",
    userId: "1",
    title: "Independance financiere",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 3000, indexIncomeToInflation: true },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 1000,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    },
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
    projection: {
      status: "ready",
      missingData: [],
      lastUpdatedAt: "2026-05-20T10:00:00.000Z",
      nextUpdateAt: "2026-05-20T23:00:00.000Z",
      summary: {
        currentCapital: 10000,
        targetCapital: 500000,
        reachedAge: 49,
        reachedDate: "2040-01-01T00:00:00.000Z",
        leadLagMonths: 12,
        progressPercent: 2,
        message: "En maintenant vos versements, objectif atteint."
      },
      series: [
        { date: "2026-05-20T00:00:00.000Z", age: 35, real: 10000, objective: 10000 },
        { date: "2027-05-20T00:00:00.000Z", age: 36, projected: 24000, objective: 45000 },
        { date: "2028-05-20T00:00:00.000Z", age: 37, projected: 52000, objective: 50000 }
      ],
      contributions: [{ month: "2026-05", amount: 1000, kind: "estimated" }]
    },
    ...overrides
  };
}

function renderPage(dto: ObjectiveDto, fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ objectives: [dto] })
  })) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/objectives"]}>
      <Routes>
        <Route path="/objectives" element={<ObjectivePage user={user} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ObjectivePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the normal objective dashboard", async () => {
    renderPage(objective());
    await waitFor(() => expect(screen.getByText("Independance financiere")).toBeInTheDocument());
    expect(screen.getByText("Projection patrimoniale")).toBeInTheDocument();
    expect(screen.getByText("Patrimoine reel")).toBeInTheDocument();
    expect(screen.getByText("Projection future")).toBeInTheDocument();
    expect(screen.getByText("Seuil objectif")).toBeInTheDocument();
    expect(screen.queryByText("objectif")).not.toBeInTheDocument();
    expect(screen.getByText("Objectif atteignable a 37 ans")).toBeInTheDocument();
    expect(screen.getByText("Versements de l'annee")).toBeInTheDocument();
    expect(screen.getByTestId("objective-contribution-chart")).toHaveClass("text-slate-100");
    expect(screen.getByText(String(new Date().getFullYear()))).toBeInTheDocument();
    expect(screen.getByText(/Derniere mise a jour/i)).toBeInTheDocument();
  });

  it("does not show a misleading real wealth legend when real data is absent", async () => {
    renderPage(objective({
      projection: {
        ...objective().projection,
        series: [
          { date: "2027-05-20T00:00:00.000Z", age: 36, projected: 24000, objective: 45000 },
          { date: "2028-05-20T00:00:00.000Z", age: 37, projected: 52000, objective: 50000 }
        ]
      }
    }));
    await waitFor(() => expect(screen.getByText("Projection patrimoniale")).toBeInTheDocument());
    expect(screen.queryByText("Patrimoine reel")).not.toBeInTheDocument();
    expect(screen.getByText("Historique reel indisponible pour le moment.")).toBeInTheDocument();
  });

  it("renders missing data cleanly", async () => {
    renderPage(objective({
      projection: {
        status: "missing_data",
        missingData: [{ field: "assumptions.currentAge", label: "Age actuel" }],
        series: [],
        contributions: []
      }
    }));
    await waitFor(() => expect(screen.getByText("Informations a completer")).toBeInTheDocument());
    expect(screen.getAllByText("Age actuel").length).toBeGreaterThan(0);
  });

  it("opens the edit modal and saves objective data", async () => {
    const dto = objective();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ objectives: [dto] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...dto, title: "Nouvel objectif" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ objectives: [{ ...dto, title: "Nouvel objectif" }] }) });
    renderPage(dto, fetchMock);

    await waitFor(() => expect(screen.getByText("Independance financiere")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /modifier/i }));
    expect(screen.getByText("Modifier l'objectif")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Nouvel objectif" } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/users/1/objectives/1");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).title).toBe("Nouvel objectif");
  });

  it("shows only objective fields required by the selected type", async () => {
    renderPage(objective());

    await waitFor(() => expect(screen.getByText("Independance financiere")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /modifier/i }));
    fireEvent.change(screen.getByLabelText("Type d'objectif"), { target: { value: "fixed_capital" } });

    expect(screen.getByLabelText("Montant cible")).toBeInTheDocument();
    expect(screen.getByLabelText("Age cible")).toBeInTheDocument();
    expect(screen.queryByLabelText("Date cible")).not.toBeInTheDocument();
    expect(screen.queryByText("Ou")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rente mensuelle voulue")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Capital final voulu")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Age d'independance financiere" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Type d'objectif"), { target: { value: "annuity_preserve_capital" } });
    expect(screen.getByLabelText("Rente mensuelle voulue")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Indexer la rente sur l'inflation" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Continuer a epargner apres le demarrage de la rente" })).toBeInTheDocument();
    expect(screen.getByLabelText("% de retrait annuel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Age debut rente")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Capital minimal final")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Age fin projection")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Montant cible")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Capital minimal necessaire" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Type d'objectif"), { target: { value: "annuity_consuming_capital" } });
    expect(screen.getByLabelText("Rente mensuelle voulue")).toBeInTheDocument();
    expect(screen.queryByLabelText("Age debut rente")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Age fin projection")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Capital final voulu")).not.toBeInTheDocument();
  });

  it("omits hidden objective fields when saving after a type change", async () => {
    const dto = objective({ config: { ...objective().config, targetAmount: 123456 } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ objectives: [dto] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => dto })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ objectives: [dto] }) });
    renderPage(dto, fetchMock);

    await waitFor(() => expect(screen.getByText("Independance financiere")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /modifier/i }));
    fireEvent.change(screen.getByLabelText("Type d'objectif"), { target: { value: "annuity_preserve_capital" } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.type).toBe("annuity_preserve_capital");
    expect(body.config).not.toHaveProperty("targetAmount");
    expect(body.config).toEqual({ monthlyIncome: 3000, indexIncomeToInflation: true, continueSavingsAfterAnnuityStart: false });
  });
});
