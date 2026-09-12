import assert from "node:assert/strict";
import test from "node:test";
import type { ObjectiveAssumptions, ObjectiveInput, ObjectiveSimulationMode } from "@pea/shared";
import { objectiveCalculatorService } from "../../services/objectives/objective-calculator.service.js";
import { objectiveInputSchema } from "../../services/objectives/objective-validation.js";
import { resolveSimulationSettings } from "../../services/objectives/simulation/simulation-settings.js";

const portfolio = {
  currentCapital: 50_000,
  realSeries: [],
  contributions: [],
  averageMonthlySavings: 0
};

const now = new Date("2026-01-15T12:00:00.000Z");

function assumptions(overrides: Partial<ObjectiveAssumptions> = {}): ObjectiveAssumptions {
  return {
    currentAge: 35,
    futureMonthlySavings: 500,
    inflationRate: 2,
    annualReturnRate: 7,
    taxRate: 0,
    statePensionMonthly: 0,
    statePensionStartAge: 67,
    scenario: "normal",
    ...overrides
  };
}

function objective(overrides: Partial<ObjectiveAssumptions> = {}): ObjectiveInput {
  return {
    title: "Capital 500k",
    type: "fixed_capital",
    active: true,
    config: { targetAmount: 500_000, targetAge: 65 },
    assumptions: assumptions(overrides)
  };
}

function projectedSeries(mode?: ObjectiveSimulationMode, overrides: Partial<ObjectiveAssumptions> = {}) {
  const projection = objectiveCalculatorService.calculate(objective({ simulationMode: mode, ...overrides }), portfolio, now);
  assert.equal(projection.status, "ready");
  return projection.series.filter((point) => point.projected !== undefined);
}

function monthlyRates(series: Array<{ projected?: number }>) {
  return series.slice(1).map((point, index) => (point.projected ?? 0) / (series[index]?.projected ?? 1) - 1);
}

test("le mode lisse reproduit exactement la projection sans mode de simulation", () => {
  const legacy = projectedSeries(undefined);
  const deterministic = projectedSeries("deterministic");
  assert.deepEqual(deterministic.map((point) => point.projected), legacy.map((point) => point.projected));
  assert.ok(deterministic.every((point) => point.projectedLow === undefined && point.projectedHigh === undefined));
});

test("le mode lisse ne cree aucune irregularite mensuelle", () => {
  const series = projectedSeries("deterministic");
  const increases = series.slice(2).map((point, index) => (point.projected ?? 0) - (series[index + 1]?.projected ?? 0));
  assert.ok(increases.every((value) => value > 0), "la courbe lisse doit croitre a chaque mois");
});

test("le mode stochastique est reproductible avec une meme graine et change avec une autre", () => {
  const first = projectedSeries("stochastic", { simulationSeed: 42 }).map((point) => point.projected);
  const second = projectedSeries("stochastic", { simulationSeed: 42 }).map((point) => point.projected);
  const other = projectedSeries("stochastic", { simulationSeed: 43 }).map((point) => point.projected);
  assert.deepEqual(second, first);
  assert.notDeepEqual(other, first);
});

test("le mode stochastique fait varier les rendements mensuels autour de la tendance", () => {
  const rates = monthlyRates(projectedSeries("stochastic", { simulationSeed: 7, simulationVolatility: 18, futureMonthlySavings: 0 }));
  const negativeMonths = rates.filter((rate) => rate < 0).length;
  const uniqueRates = new Set(rates.map((rate) => rate.toFixed(6)));
  assert.ok(uniqueRates.size > rates.length / 2, "les rendements mensuels doivent differer");
  assert.ok(negativeMonths > 0, "une projection volatile doit contenir des mois negatifs");
});

test("le mode chocs enchaine croissance, chute marquee puis reprise", () => {
  const rates = monthlyRates(projectedSeries("shocks", {
    simulationSeed: 11,
    simulationShockFrequency: 3,
    simulationShockSeverity: 40,
    futureMonthlySavings: 0
  }));
  const crashIndex = rates.findIndex((rate) => rate < -0.02);
  assert.ok(crashIndex >= 0, "un choc doit provoquer une chute mensuelle marquee");
  const recovery = rates.slice(crashIndex + 1).find((rate) => rate > 0.01);
  assert.ok(recovery !== undefined, "une reprise doit suivre le choc");
  assert.ok(rates.some((rate) => Math.abs(rate - rates[0]!) < 1e-12), "des mois calmes doivent rester sur la tendance");
});

test("le mode lisse ignore les parametres aleatoires", () => {
  const tuned = projectedSeries("deterministic", {
    simulationVolatility: 30,
    simulationShockFrequency: 2,
    simulationShockSeverity: 60,
    simulationSeed: 1234
  }).map((point) => point.projected);
  assert.deepEqual(tuned, projectedSeries("deterministic").map((point) => point.projected));
});

test("une volatilite nulle en mode stochastique revient a la courbe lisse", () => {
  const flat = projectedSeries("stochastic", { simulationVolatility: 0 }).map((point) => point.projected);
  assert.deepEqual(flat, projectedSeries("deterministic").map((point) => point.projected));
});

test("le mode Monte-Carlo fournit une mediane encadree et une probabilite de reussite", () => {
  const projection = objectiveCalculatorService.calculate(
    objective({ simulationMode: "monte_carlo", simulationSeed: 5 }),
    portfolio,
    now
  );
  assert.equal(projection.status, "ready");
  const future = projection.series.filter((point) => point.projected !== undefined);
  assert.ok(future.length > 0);
  for (const point of future) {
    assert.ok(point.projectedLow !== undefined && point.projectedHigh !== undefined);
    assert.ok(point.projectedLow! <= point.projected! + 1e-6, "la borne basse doit rester sous la mediane");
    assert.ok(point.projectedHigh! >= point.projected! - 1e-6, "la borne haute doit rester au-dessus de la mediane");
  }
  const last = future.at(-1)!;
  assert.ok(last.projectedHigh! > last.projectedLow!, "l'intervalle doit s'elargir avec le temps");
  const probability = projection.summary?.successProbability;
  assert.ok(probability !== undefined && probability >= 0 && probability <= 100);
});

test("le mode Monte-Carlo reste identique entre deux recalculs", () => {
  const first = projectedSeries("monte_carlo", { simulationSeed: 9 }).map((point) => point.projected);
  const second = projectedSeries("monte_carlo", { simulationSeed: 9 }).map((point) => point.projected);
  assert.deepEqual(second, first);
});

test("les modes sans intervalle n'exposent pas de probabilite de reussite", () => {
  const projection = objectiveCalculatorService.calculate(objective({ simulationMode: "stochastic" }), portfolio, now);
  assert.equal(projection.summary?.successProbability, undefined);
});

test("les parametres de simulation hors bornes sont ramenes dans les limites", () => {
  const settings = resolveSimulationSettings(assumptions({
    simulationMode: "monte_carlo",
    simulationVolatility: 500,
    simulationShockFrequency: 0,
    simulationShockSeverity: 999,
    simulationSeed: -50
  }));
  assert.equal(settings.annualVolatility, 1);
  assert.equal(settings.shockFrequencyYears, 1);
  assert.equal(settings.shockSeverity, 0.9);
  assert.equal(settings.seed, 0);
  assert.ok(settings.trajectoryCount > 1);
});

test("la validation refuse un mode inconnu et une volatilite negative", () => {
  const base = { title: "Test", type: "fixed_capital", config: { targetAmount: 1000, targetAge: 60 } };
  assert.throws(() => objectiveInputSchema.parse({ ...base, assumptions: { ...assumptions(), simulationMode: "chaos" } }));
  assert.throws(() => objectiveInputSchema.parse({ ...base, assumptions: { ...assumptions(), simulationVolatility: -1 } }));
  const parsed = objectiveInputSchema.parse({ ...base, assumptions: { ...assumptions(), simulationMode: "shocks", simulationSeed: 12 } });
  assert.equal(parsed.assumptions.simulationMode, "shocks");
  assert.equal(parsed.assumptions.simulationSeed, 12);
  assert.equal(parsed.assumptions.simulationVolatility, 15);
});

test("la validation applique le mode lisse par defaut", () => {
  const parsed = objectiveInputSchema.parse({
    title: "Defaut",
    type: "fixed_capital",
    config: { targetAmount: 1000, targetAge: 60 },
    assumptions: assumptions()
  });
  assert.equal(parsed.assumptions.simulationMode, "deterministic");
});
