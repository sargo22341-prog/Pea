import type { SeededRandom } from "./seeded-random.js";
import { settingsUseShocks, settingsUseVolatility, type SimulationSettings } from "./simulation-settings.js";

const monthsPerYear = 12;
/** Duree de la phase de baisse d'un choc. */
const crashDurationMonths = 6;
/** Duree de la phase de reprise qui suit un choc. */
const recoveryDurationMonths = 18;
/** Part de la baisse regagnee pendant la reprise: un choc laisse une trace durable. */
const recoveredShare = 0.8;
/** Amplitude du tirage autour de la severite moyenne demandee. */
const severitySpread = 0.4;
const minShockSeverity = 0.05;
const maxShockSeverity = 0.8;

type ShockPhase = "calm" | "crash" | "recovery";

interface ShockState {
  phase: ShockPhase;
  remainingMonths: number;
  monthlyReturn: number;
  severity: number;
}

function drawSeverity(settings: SimulationSettings, random: SeededRandom) {
  const factor = 1 - severitySpread + random.next() * severitySpread * 2;
  return Math.min(maxShockSeverity, Math.max(minShockSeverity, settings.shockSeverity * factor));
}

function crashMonthlyReturn(severity: number) {
  return Math.pow(1 - severity, 1 / crashDurationMonths) - 1;
}

function recoveryMonthlyReturn(severity: number, baseMonthlyReturn: number) {
  return (1 + baseMonthlyReturn) * Math.pow(1 / (1 - severity), recoveredShare / recoveryDurationMonths) - 1;
}

function volatilityFactor(settings: SimulationSettings, random: SeededRandom) {
  const monthlyVolatility = settings.annualVolatility / Math.sqrt(monthsPerYear);
  return Math.exp(monthlyVolatility * random.normal() - (monthlyVolatility * monthlyVolatility) / 2);
}

/**
 * Construit le rendement mensuel d'une trajectoire.
 * Mode lisse: rendement constant. Mode volatil: bruit log-normal d'esperance neutre.
 * Mode chocs: alternance calme / chute / reprise declenchee aleatoirement.
 */
export function createMonthlyReturnPath(baseMonthlyReturn: number, settings: SimulationSettings, random: SeededRandom) {
  const withShocks = settingsUseShocks(settings);
  const withVolatility = settingsUseVolatility(settings);
  const shockProbability = withShocks ? 1 / (settings.shockFrequencyYears * monthsPerYear) : 0;
  const state: ShockState = { phase: "calm", remainingMonths: 0, monthlyReturn: baseMonthlyReturn, severity: 0 };

  const advanceShockState = () => {
    if (state.remainingMonths > 0) {
      state.remainingMonths -= 1;
      if (state.remainingMonths === 0 && state.phase === "crash") {
        state.phase = "recovery";
        state.remainingMonths = recoveryDurationMonths;
        state.monthlyReturn = recoveryMonthlyReturn(state.severity, baseMonthlyReturn);
      } else if (state.remainingMonths === 0) {
        state.phase = "calm";
        state.monthlyReturn = baseMonthlyReturn;
      }
      return;
    }
    if (withShocks && random.next() < shockProbability) {
      state.phase = "crash";
      state.severity = drawSeverity(settings, random);
      state.remainingMonths = crashDurationMonths;
      state.monthlyReturn = crashMonthlyReturn(state.severity);
    }
  };

  return () => {
    advanceShockState();
    const trend = state.phase === "calm" ? baseMonthlyReturn : state.monthlyReturn;
    if (!withVolatility) return trend;
    return (1 + trend) * volatilityFactor(settings, random) - 1;
  };
}
