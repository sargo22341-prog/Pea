import type { ObjectiveDto, User } from "@pea/shared";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { ObjectivePage } from "../../pages/objectives/ObjectivePage";

export const objectiveUser: User = {
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

export function buildObjective(overrides: Partial<ObjectiveDto> = {}): ObjectiveDto {
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
        message: "objectives.summaryMessage.reachable"
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

/** Type du mock de `fetch` partage par les tests de la page objectif. */
export type ObjectiveFetchMock = ReturnType<typeof vi.fn>;

export function objectiveListFetchMock(dto: ObjectiveDto): ObjectiveFetchMock {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ objectives: [dto] }) });
}

export function renderObjectivePage(dto: ObjectiveDto, fetchMock: ObjectiveFetchMock = objectiveListFetchMock(dto)) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/objectives"]}>
      <Routes>
        <Route path="/objectives" element={<ObjectivePage user={objectiveUser} />} />
      </Routes>
    </MemoryRouter>
  );
  return fetchMock;
}
