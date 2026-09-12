import type { ObjectiveDto } from "@pea/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildObjective, renderObjectivePage, type ObjectiveFetchMock } from "./objectiveFixture";

function objective(overrides: Partial<ObjectiveDto> = {}) {
  return buildObjective(overrides);
}

function renderPage(dto: ObjectiveDto, fetchMock?: ObjectiveFetchMock) {
  return fetchMock ? renderObjectivePage(dto, fetchMock) : renderObjectivePage(dto);
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
    expect(screen.getByText("En maintenant vos versements et un rendement annuel de 7 %, vous pourriez demarrer votre rente a 49 ans.")).toBeInTheDocument();
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
