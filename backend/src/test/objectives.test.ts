import assert from "node:assert/strict";
import test from "node:test";
import { objectiveCalculatorService } from "../services/objectives/objective-calculator.service.js";
import { objectivePortfolioService } from "../services/objectives/objective-portfolio.service.js";
import { portfolioService } from "../services/portfolio/portfolio.service.js";
import { portfolioRepository } from "../repositories/portfolio/portfolio.repository.js";
import { runBackendScript } from "./helpers/backend-script.js";

const portfolio = {
  currentCapital: 10_000,
  realSeries: [],
  contributions: [],
  averageMonthlySavings: 500
};

test("objective calculator reports missing required data", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Capital",
    type: "fixed_capital",
    active: true,
    config: {},
    assumptions: {
      futureMonthlySavings: 500,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "missing_data");
  assert.ok(projection.missingData.some((item) => item.field === "assumptions.currentAge"));
  assert.ok(projection.missingData.some((item) => item.field === "config.targetAmount"));
});

test("objective calculator projects a fixed capital target", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "100k",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 100_000, targetAge: 45 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 1000,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.targetCapital, 100_000);
  assert.ok((projection.summary?.progressPercent ?? 0) > 0);
  assert.ok(projection.series.some((point) => point.projected !== undefined));
});

test("objective calculator keeps explicit zero future savings instead of historical fallback", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Zero savings",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 100_000, targetAge: 36 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 0,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, averageMonthlySavings: 500 });

  assert.equal(projection.status, "ready");
  assert.equal(projection.series.find((point) => point.projected !== undefined && point.age > 35)?.projected, 10_000);
});

test("objective calculator falls back to historical savings when future savings is missing", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Fallback savings",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 100_000, targetAge: 36 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: null,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, averageMonthlySavings: 500 });

  assert.equal(projection.status, "ready");
  assert.equal(projection.series.find((point) => point.projected !== undefined && point.age > 35)?.projected, 10_500);
});

test("objective calculator computes annuity with final capital", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Rente",
    type: "annuity_target_final_capital",
    active: true,
    config: { monthlyIncome: 2500, finalCapitalTarget: 300_000 },
    assumptions: {
      currentAge: 40,
      futureMonthlySavings: 1500,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "ready");
  assert.ok((projection.summary?.targetCapital ?? 0) > 300_000);
});

test("objective calculator infers annuity consuming capital start age", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Rente possible",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 2500,
      inflationRate: 2.5,
      annualReturnRate: 7,
      taxRate: 21,
      statePensionMonthly: 1000,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, portfolio);

  assert.equal(projection.status, "ready");
  assert.ok((projection.summary?.reachedAge ?? 0) > 35);
  assert.match(projection.summary?.message ?? "", /demarrer votre rente/);
});

test("annuity projections stop future savings after the rent starts by default", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Stop savings",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000 },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 1000,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      projectionEndAge: 90,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 400_000, averageMonthlySavings: 0 });

  const firstProjectedMonth = projection.series.find((point) => point.projected !== undefined && point.age > 60);
  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.reachedAge, 60);
  assert.equal(firstProjectedMonth?.projected, 399_000);
  assert.equal(projection.contributions.find((point) => point.kind === "estimated")?.amount, 0);
});

test("annuity projections can keep saving after the rent starts when explicitly enabled", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Keep savings",
    type: "annuity_consuming_capital",
    active: true,
    config: { monthlyIncome: 1000, continueSavingsAfterAnnuityStart: true },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 1000,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      projectionEndAge: 90,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 400_000, averageMonthlySavings: 0 });

  const firstProjectedMonth = projection.series.find((point) => point.projected !== undefined && point.age > 60);
  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.reachedAge, 60);
  assert.equal(firstProjectedMonth?.projected, 400_000);
  assert.equal(projection.contributions.find((point) => point.kind === "estimated")?.amount, 1000);
});

test("preserve-capital annuity does not consume capital after the rent starts", () => {
  const projection = objectiveCalculatorService.calculate({
    title: "Preserve",
    type: "annuity_preserve_capital",
    active: true,
    config: { monthlyIncome: 1000 },
    assumptions: {
      currentAge: 60,
      futureMonthlySavings: 0,
      inflationRate: 0,
      annualReturnRate: 0,
      taxRate: 0,
      withdrawalRate: 4,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      scenario: "normal"
    }
  }, { ...portfolio, currentCapital: 400_000, averageMonthlySavings: 0 });

  assert.equal(projection.status, "ready");
  assert.equal(projection.summary?.targetCapital, 300_000);
  assert.ok(projection.series.filter((point) => point.projected !== undefined).every((point) => (point.projected ?? 0) >= 400_000));
});

test("inflation-indexed rent increases required capital for annuities", () => {
  const base = {
    title: "Inflation",
    type: "annuity_consuming_capital" as const,
    active: true,
    config: { monthlyIncome: 2000 },
    assumptions: {
      currentAge: 35,
      futureMonthlySavings: 0,
      inflationRate: 3,
      annualReturnRate: 5,
      taxRate: 0,
      statePensionMonthly: 0,
      statePensionStartAge: 67,
      projectionEndAge: 90,
      scenario: "normal" as const
    }
  };
  const withoutIndexation = objectiveCalculatorService.calculate(base, portfolio);
  const withIndexation = objectiveCalculatorService.calculate({ ...base, config: { ...base.config, indexIncomeToInflation: true } }, portfolio);

  assert.equal(withoutIndexation.status, "ready");
  assert.equal(withIndexation.status, "ready");
  assert.ok((withIndexation.summary?.targetCapital ?? 0) > (withoutIndexation.summary?.targetCapital ?? 0));
});

test("state pension consistently reduces required capital for rent objectives", () => {
  const baseAssumptions = {
    currentAge: 70,
    futureMonthlySavings: 0,
    inflationRate: 0,
    annualReturnRate: 4,
    taxRate: 0,
    withdrawalRate: 4,
    statePensionStartAge: 67,
    projectionEndAge: 90,
    scenario: "normal" as const
  };
  const withoutPension = objectiveCalculatorService.calculate({
    title: "No pension",
    type: "annuity_target_final_capital",
    active: true,
    config: { monthlyIncome: 2000, finalCapitalTarget: 100_000 },
    assumptions: { ...baseAssumptions, statePensionMonthly: 0 }
  }, portfolio);
  const withPension = objectiveCalculatorService.calculate({
    title: "With pension",
    type: "annuity_target_final_capital",
    active: true,
    config: { monthlyIncome: 2000, finalCapitalTarget: 100_000 },
    assumptions: { ...baseAssumptions, statePensionMonthly: 1000 }
  }, portfolio);

  assert.equal(withoutPension.status, "ready");
  assert.equal(withPension.status, "ready");
  assert.ok((withPension.summary?.targetCapital ?? 0) < (withoutPension.summary?.targetCapital ?? 0));
});

test("objective portfolio snapshot uses portfolio market value history for real wealth", async () => {
  const originalSummary = portfolioService.summary;
  const originalPerformance = portfolioService.performance;
  const originalListPositions = portfolioRepository.listPositions;
  try {
    portfolioService.summary = async () => ({ totalValue: 3800 }) as never;
    portfolioService.performance = async () => [
      { date: "2026-01-01T00:00:00.000Z", value: 1000, invested: 1000, gain: 0, gainPercent: 0 },
      { date: "2026-02-01T00:00:00.000Z", value: 2500, invested: 2000, gain: 500, gainPercent: 25 },
      { date: "2026-03-01T00:00:00.000Z", value: 3800, invested: 3000, gain: 800, gainPercent: 26.67 }
    ] as never;
    portfolioRepository.listPositions = () => [] as never;

    const snapshot = await objectivePortfolioService.snapshot(1, 35);
    assert.deepEqual(snapshot.realSeries.map((point) => point.real), [1000, 2500, 3800]);
    assert.equal(snapshot.currentCapital, 3800);
  } finally {
    portfolioService.summary = originalSummary;
    portfolioService.performance = originalPerformance;
    portfolioRepository.listPositions = originalListPositions;
  }
});

test("objective endpoints store cache and recalculate", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";

    const password = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const user = await setup.json();
        const create = await fetch(\`\${baseUrl}/api/users/\${user.id}/objectives\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({
            title: "Capital",
            type: "fixed_capital",
            active: true,
            config: { targetAmount: 100000, targetAge: 45 },
            assumptions: { currentAge: 35, futureMonthlySavings: 1000, inflationRate: 2.5, annualReturnRate: 7, taxRate: 21, statePensionMonthly: 1000, statePensionStartAge: 67, scenario: "normal" }
          })
        });
        const body = await create.json();
        const recalculate = await fetch(\`\${baseUrl}/api/users/\${user.id}/objectives/\${body.id}/recalculate\`, {
          method: "POST",
          headers: { Cookie: cookie }
        });
        const cacheRows = db.prepare("SELECT COUNT(*) AS count FROM objective_projection_cache").get();
        console.log("__RESULT__" + JSON.stringify({
          createStatus: create.status,
          recalculateStatus: recalculate.status,
          cacheCount: cacheRows.count,
          projectionStatus: body.projection.status
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(result.createStatus, 201);
  assert.equal(result.recalculateStatus, 200);
  assert.equal(result.cacheCount, 1);
  assert.equal(result.projectionStatus, "ready");
});

test("portfolio mutations recalculate only active objectives for the affected user", () => {
  const result = runBackendScript(`
    import { app } from "./app.ts";
    import { db } from "./db.ts";
    import { objectiveProjectionInvalidationService } from "./services/objectives/objective-projection-invalidation.service.ts";

    const password = "correct horse battery staple";
    const sentinel = "2000-01-01T00:00:00.000Z";
    function cacheStamp(userId) {
      return db.prepare("SELECT last_updated_at FROM objective_projection_cache WHERE user_id = ?").get(userId)?.last_updated_at;
    }
    function resetStamp(userId) {
      db.prepare("UPDATE objective_projection_cache SET last_updated_at = ?, next_update_at = ? WHERE user_id = ?").run(sentinel, sentinel, userId);
    }

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password, confirmPassword: password })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
        const alice = await setup.json();
        const bobResponse = await fetch(\`\${baseUrl}/api/admin/users\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ username: "bob", password })
        });
        const bob = await bobResponse.json();

        await fetch(\`\${baseUrl}/api/users/\${alice.id}/objectives\`, { headers: { Cookie: cookie } });
        await fetch(\`\${baseUrl}/api/users/\${bob.id}/objectives\`, { headers: { Cookie: cookie } });
        resetStamp(alice.id);
        resetStamp(bob.id);

        const created = await fetch(\`\${baseUrl}/api/portfolio/positions/ensure\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ symbol: "AIR.PA", name: "Air Liquide", currency: "EUR" })
        });
        const position = await created.json();
        await objectiveProjectionInvalidationService.flushUser(alice.id, "test add");
        const afterAdd = cacheStamp(alice.id);

        resetStamp(alice.id);
        await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}\`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ quantity: 2, averageBuyPrice: 100, currency: "EUR" })
        });
        await objectiveProjectionInvalidationService.flushUser(alice.id, "test update");
        const afterUpdate = cacheStamp(alice.id);

        resetStamp(alice.id);
        await fetch(\`\${baseUrl}/api/portfolio/positions/\${position.id}\`, {
          method: "DELETE",
          headers: { Cookie: cookie }
        });
        await objectiveProjectionInvalidationService.flushUser(alice.id, "test delete");
        const afterDelete = cacheStamp(alice.id);
        const bobStamp = cacheStamp(bob.id);

        console.log("__RESULT__" + JSON.stringify({ afterAdd, afterUpdate, afterDelete, bobStamp }));
      } finally {
        server.close();
      }
    });
  `);

  assert.notEqual(result.afterAdd, "2000-01-01T00:00:00.000Z");
  assert.notEqual(result.afterUpdate, "2000-01-01T00:00:00.000Z");
  assert.notEqual(result.afterDelete, "2000-01-01T00:00:00.000Z");
  assert.equal(result.bobStamp, "2000-01-01T00:00:00.000Z");
});
