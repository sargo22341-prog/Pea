/** Flux daté pour le calcul du taux de rendement interne (négatif = apport, positif = retrait/valeur). */
export interface DatedCashFlow {
  timeMs: number;
  amount: number;
}

const yearMs = 365.25 * 24 * 60 * 60 * 1000;
const maxIterations = 200;
const tolerance = 1e-9;
/** Bornes du taux annuel recherché : -99,99 % à +10 000 %. */
const minRate = -0.9999;
const maxRate = 100;

function netPresentValue(flows: DatedCashFlow[], rate: number, originMs: number) {
  return flows.reduce((sum, flow) => sum + flow.amount / (1 + rate) ** ((flow.timeMs - originMs) / yearMs), 0);
}

/**
 * Taux de rendement interne annualisé (XIRR) par dichotomie : robuste quelle que soit la forme des
 * flux. Renvoie `undefined` sans flux de signes opposés, si la période est trop courte pour être
 * significative ou si aucun taux n'annule la valeur actuelle nette dans les bornes.
 */
export function xirr(flows: DatedCashFlow[], minimumSpanMs = 0): number | undefined {
  const usable = flows.filter((flow) => Number.isFinite(flow.amount) && flow.amount !== 0 && Number.isFinite(flow.timeMs));
  if (!usable.some((flow) => flow.amount < 0) || !usable.some((flow) => flow.amount > 0)) return undefined;
  const times = usable.map((flow) => flow.timeMs);
  const originMs = Math.min(...times);
  if (Math.max(...times) - originMs < minimumSpanMs) return undefined;

  let low = minRate;
  let high = maxRate;
  let lowValue = netPresentValue(usable, low, originMs);
  const highValue = netPresentValue(usable, high, originMs);
  if (Math.sign(lowValue) === Math.sign(highValue)) return undefined;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const middle = (low + high) / 2;
    const value = netPresentValue(usable, middle, originMs);
    if (Math.abs(value) < tolerance || high - low < tolerance) return middle;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = middle;
      lowValue = value;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}
