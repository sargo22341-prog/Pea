import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildObjective, renderObjectivePage, type ObjectiveFetchMock } from "./objectiveFixture";

// jsdom ne mesure aucun element: on donne une taille fixe au conteneur pour que Recharts dessine reellement.
vi.mock("../../components/charts/SafeResponsiveContainer", () => ({
  SafeResponsiveContainer: ({ children }: { children: ReactElement }) => (
    <ResponsiveContainer height={300} width={600}>{children}</ResponsiveContainer>
  )
}));

function chartAreas() {
  return document.querySelectorAll(".recharts-area-area");
}

async function openEditModal(dto = buildObjective(), fetchMock?: ObjectiveFetchMock) {
  const mock = fetchMock ? renderObjectivePage(dto, fetchMock) : renderObjectivePage(dto);
  await waitFor(() => expect(screen.getByText("Independance financiere")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /modifier/i }));
  return mock;
}

function selectMode(label: string) {
  fireEvent.change(screen.getByLabelText("Forme de la courbe"), { target: { value: label } });
}

describe("options de simulation de la courbe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("propose la courbe lisse par defaut et masque les reglages aleatoires", async () => {
    await openEditModal();

    expect(screen.getByLabelText("Forme de la courbe")).toHaveValue("deterministic");
    expect(screen.getByText(/Croissance reguliere mois apres mois/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Volatilite annuelle (%)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Graine du tirage")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Baisse moyenne d'un choc (%)")).not.toBeInTheDocument();
  });

  it("affiche la volatilite et la graine en projection stochastique", async () => {
    await openEditModal();
    selectMode("stochastic");

    expect(screen.getByLabelText("Volatilite annuelle (%)")).toHaveValue(15);
    expect(screen.getByLabelText("Graine du tirage")).toBeInTheDocument();
    expect(screen.queryByLabelText("Frequence des chocs (annees entre deux crises)")).not.toBeInTheDocument();
  });

  it("affiche les reglages de crise en mode chocs aleatoires", async () => {
    await openEditModal();
    selectMode("shocks");

    expect(screen.getByLabelText("Frequence des chocs (annees entre deux crises)")).toHaveValue(8);
    expect(screen.getByLabelText("Baisse moyenne d'un choc (%)")).toHaveValue(30);
    expect(screen.queryByLabelText("Volatilite annuelle (%)")).not.toBeInTheDocument();
  });

  it("combine volatilite et chocs en mode Monte-Carlo", async () => {
    await openEditModal();
    selectMode("monte_carlo");

    expect(screen.getByLabelText("Volatilite annuelle (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("Frequence des chocs (annees entre deux crises)")).toBeInTheDocument();
    expect(screen.getByLabelText("Baisse moyenne d'un choc (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("Graine du tirage")).toBeInTheDocument();
  });

  it("tire une nouvelle graine sur demande", async () => {
    await openEditModal();
    selectMode("stochastic");
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    fireEvent.click(screen.getByRole("button", { name: /nouveau tirage/i }));

    expect(screen.getByLabelText("Graine du tirage")).toHaveValue(1073741823);
  });

  it("enregistre le mode et ses parametres", async () => {
    const dto = buildObjective();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ objectives: [dto] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => dto })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ objectives: [dto] }) });
    await openEditModal(dto, fetchMock);

    selectMode("shocks");
    fireEvent.change(screen.getByLabelText("Baisse moyenne d'un choc (%)"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Graine du tirage"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.assumptions.simulationMode).toBe("shocks");
    expect(body.assumptions.simulationShockSeverity).toBe(45);
    expect(body.assumptions.simulationSeed).toBe(7);
    expect(body.assumptions.simulationVolatility).toBe(15);
  });
});

describe("graphique de projection simule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("annonce le mode lisse sans intervalle ni probabilite", async () => {
    renderObjectivePage(buildObjective());
    await waitFor(() => expect(screen.getByText("Projection patrimoniale")).toBeInTheDocument());

    expect(screen.getAllByText("Courbe lisse (sans aleatoire)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Intervalle 10 %-90 %")).not.toBeInTheDocument();
    expect(screen.queryByText(/Probabilite d'atteindre l'objectif/)).not.toBeInTheDocument();
    expect(chartAreas()).toHaveLength(0);
  });

  it("affiche l'intervalle et la probabilite de reussite en Monte-Carlo", async () => {
    const base = buildObjective();
    renderObjectivePage(buildObjective({
      assumptions: { ...base.assumptions, simulationMode: "monte_carlo", simulationSeed: 3 },
      projection: {
        ...base.projection,
        summary: { ...base.projection.summary!, successProbability: 72.5 },
        series: [
          { date: "2026-05-20T00:00:00.000Z", age: 35, real: 10000, objective: 10000 },
          { date: "2027-05-20T00:00:00.000Z", age: 36, projected: 24000, projectedLow: 18000, projectedHigh: 31000, objective: 45000 },
          { date: "2028-05-20T00:00:00.000Z", age: 37, projected: 52000, projectedLow: 34000, projectedHigh: 78000, objective: 50000 }
        ]
      }
    }));
    await waitFor(() => expect(screen.getByText("Projection patrimoniale")).toBeInTheDocument());

    expect(screen.getAllByText("Monte-Carlo (mediane et intervalle)").length).toBeGreaterThan(0);
    expect(screen.getByText("Intervalle 10 %-90 %")).toBeInTheDocument();
    expect(screen.getByText("Probabilite d'atteindre l'objectif: 72.5 % des trajectoires simulees")).toBeInTheDocument();
    expect(screen.getByText("Graine du tirage")).toBeInTheDocument();
    await waitFor(() => expect(chartAreas().length).toBe(1));
  });
});
