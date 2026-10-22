import { xirr } from "../../cash/xirr.js";

/** Flux d'un titre : achat (frais inclus), vente (frais déduits) ou dividende, en montant positif. */
export interface ReturnFlow {
  timeMs: number;
  kind: "buy" | "sell" | "dividend";
  amount: number;
}

/** Période valorisée à ses deux bornes (valeur des titres détenus). */
export interface ValuedPeriod {
  startMs: number;
  endMs: number;
  startValue: number;
  endValue: number;
}

export interface PeriodReturn {
  invested: number;
  sold: number;
  dividends: number;
  capitalGain: number;
  gain: number;
  returnPercent?: number | undefined;
}

/** Durée minimale des flux pour annualiser un rendement : en deçà, le taux annuel serait trompeur. */
export const minimumAnnualizationSpanMs = 90 * 24 * 60 * 60 * 1000;

/** Apport net au portefeuille de titres : un achat apporte du capital, une vente ou un dividende en retire. */
function contribution(flow: ReturnFlow) {
  return flow.kind === "buy" ? flow.amount : -flow.amount;
}

/**
 * Rendement d'une période par la méthode de Dietz modifiée : le gain est rapporté au capital
 * engagé en moyenne, chaque flux comptant au prorata du temps restant dans la période. Un achat
 * de décembre pèse donc peu dans le rendement de l'année, contrairement à un rendement simple.
 * Les flux hors de [startMs, endMs] sont ignorés : des périodes successives ne doivent pas se chevaucher.
 */
export function periodReturn(period: ValuedPeriod, flows: ReturnFlow[]): PeriodReturn {
  const duration = period.endMs - period.startMs;
  let invested = 0;
  let sold = 0;
  let dividends = 0;
  let weightedCapital = period.startValue;
  for (const flow of flows) {
    if (flow.timeMs < period.startMs || flow.timeMs > period.endMs) continue;
    if (flow.kind === "buy") invested += flow.amount;
    else if (flow.kind === "sell") sold += flow.amount;
    else dividends += flow.amount;
    const weight = duration > 0 ? (period.endMs - flow.timeMs) / duration : 1;
    weightedCapital += contribution(flow) * weight;
  }
  const capitalGain = period.endValue - period.startValue - invested + sold;
  const gain = capitalGain + dividends;
  return {
    invested,
    sold,
    dividends,
    capitalGain,
    gain,
    returnPercent: weightedCapital > 0 ? (gain / weightedCapital) * 100 : undefined
  };
}

/**
 * Taux de rendement interne annualisé (TRI) : chaque euro investi est rémunéré sur sa durée réelle
 * de placement. La valeur actuelle des titres clôt les flux comme une vente fictive.
 */
export function annualizedReturnPercent(flows: ReturnFlow[], currentValue: number, nowMs: number) {
  const dated = flows.map((flow) => ({ timeMs: flow.timeMs, amount: -contribution(flow) }));
  dated.push({ timeMs: nowMs, amount: currentValue });
  const rate = xirr(dated, minimumAnnualizationSpanMs);
  return rate === undefined ? undefined : rate * 100;
}
