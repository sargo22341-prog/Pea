/**
 * Simulation « boule de neige » des dividendes, avec ou sans réinvestissement.
 *
 * Hypothèse volontairement simple et affichée à l'utilisateur : le cours et le dividende
 * progressent au même rythme, le rendement reste donc constant. Réinvestir chaque année les
 * dividendes (sans impôt dans un PEA) augmente le nombre de titres de ce rendement.
 */

export const REINVESTMENT_HORIZON_YEARS = { min: 5, max: 20, default: 10 } as const;
/** Croissance annuelle du dividende proposée par le curseur (fractions). */
export const REINVESTMENT_GROWTH = { min: 0, max: 0.1, step: 0.005 } as const;

export interface ReinvestmentInput {
  /** Valeur actuelle des positions. */
  marketValue: number;
  /** Dividendes annuels attendus au rythme actuel. */
  annualIncome: number;
  /** Croissance annuelle du dividende (fraction). */
  growthRate: number;
  horizonYears: number;
}

export interface ReinvestmentPoint {
  /** Années écoulées depuis aujourd'hui (0 = revenu actuel). */
  year: number;
  incomeWithout: number;
  incomeWith: number;
  /** Dividendes perçus depuis aujourd'hui, année courante incluse. */
  cumulativeWithout: number;
  cumulativeWith: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Revenu annuel année par année ; vide sans revenu ni valeur de portefeuille exploitables. */
export function simulateReinvestment(input: ReinvestmentInput): ReinvestmentPoint[] {
  const { marketValue, annualIncome } = input;
  if (!Number.isFinite(marketValue) || !Number.isFinite(annualIncome) || marketValue <= 0 || annualIncome <= 0) return [];
  const growth = clamp(Number.isFinite(input.growthRate) ? input.growthRate : 0, REINVESTMENT_GROWTH.min, REINVESTMENT_GROWTH.max);
  const horizon = Math.round(clamp(input.horizonYears, REINVESTMENT_HORIZON_YEARS.min, REINVESTMENT_HORIZON_YEARS.max));
  const dividendYield = annualIncome / marketValue;

  const points: ReinvestmentPoint[] = [];
  let cumulativeWithout = 0;
  let cumulativeWith = 0;
  for (let year = 0; year <= horizon; year += 1) {
    const incomeWithout = annualIncome * (1 + growth) ** year;
    const incomeWith = incomeWithout * (1 + dividendYield) ** year;
    if (year > 0) {
      cumulativeWithout += incomeWithout;
      cumulativeWith += incomeWith;
    }
    points.push({ year, incomeWithout, incomeWith, cumulativeWithout, cumulativeWith });
  }
  return points;
}

/**
 * Croissance proposée par défaut : moyenne des croissances sur 5 ans pondérée par le revenu de
 * chaque actif, bornée au curseur et arrondie à son pas. Nulle sans historique exploitable.
 */
export function defaultReinvestmentGrowth(assets: readonly { income: number; growthRate?: number | undefined }[]): number {
  const weighted = assets.filter((asset) => asset.growthRate !== undefined && Number.isFinite(asset.growthRate) && asset.income > 0);
  const totalIncome = weighted.reduce((sum, asset) => sum + asset.income, 0);
  if (totalIncome <= 0) return 0;
  const average = weighted.reduce((sum, asset) => sum + asset.income * (asset.growthRate ?? 0), 0) / totalIncome;
  const bounded = clamp(average, REINVESTMENT_GROWTH.min, REINVESTMENT_GROWTH.max);
  return Math.round(bounded / REINVESTMENT_GROWTH.step) * REINVESTMENT_GROWTH.step;
}
