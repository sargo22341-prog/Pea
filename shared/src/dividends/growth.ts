/**
 * Croissance du dividende par action : source de vérité unique, utilisée par le backend et par
 * les pages Dividendes et fiche actif. Seules les années civiles complètes comptent.
 */

/** Profondeur de l'historique de dividendes demandé à Yahoo (graphique `chart`, évènements `div`). */
export const DIVIDEND_HISTORY_YEARS = 10;
/** Période du taux de croissance annuel moyen du dividende. */
export const DIVIDEND_GROWTH_YEARS = 5;
/** Hausses annuelles consécutives nécessaires au badge « Aristocrate maison ». */
export const ARISTOCRAT_MIN_YEARS = 5;

export interface DividendYearAmount {
  year: number;
  /** Somme des dividendes par action détachés dans l'année. */
  amountPerShare: number;
}

export interface DividendGrowthSummary {
  /** Années complètes, de la première année versée à l'an dernier (années sans versement à 0). */
  history: DividendYearAmount[];
  /** Taux de croissance annuel moyen sur `DIVIDEND_GROWTH_YEARS` ans (fraction), −1 si le dividende a été supprimé. */
  growthRate?: number | undefined;
  /** Nombre de hausses annuelles consécutives jusqu'à l'an dernier. */
  increaseStreak: number;
  aristocrat: boolean;
}

function utcYear(date: string) {
  const time = Date.parse(date);
  return Number.isFinite(time) ? new Date(time).getUTCFullYear() : undefined;
}

/**
 * Montants annuels par action des années complètes. L'année en cours n'est pas terminée et la
 * première année de la fenêtre d'historique n'est que partiellement couverte : elles sont exclues.
 */
export function annualDividendHistory(events: readonly { date: string; amount: number }[], currentYear: number): DividendYearAmount[] {
  const firstCompleteYear = currentYear - DIVIDEND_HISTORY_YEARS + 1;
  const lastCompleteYear = currentYear - 1;
  const totals = new Map<number, number>();
  for (const event of events) {
    const year = utcYear(event.date);
    if (year === undefined || year < firstCompleteYear || year > lastCompleteYear || !Number.isFinite(event.amount) || event.amount <= 0) continue;
    totals.set(year, (totals.get(year) ?? 0) + event.amount);
  }
  if (!totals.size) return [];
  const firstPaidYear = Math.min(...totals.keys());
  const history: DividendYearAmount[] = [];
  for (let year = firstPaidYear; year <= lastCompleteYear; year += 1) history.push({ year, amountPerShare: totals.get(year) ?? 0 });
  return history;
}

/**
 * Taux de croissance annuel moyen entre l'an dernier et `years` ans plus tôt. Absent si l'année
 * de départ précède le premier versement connu ; −1 (−100 %) si le dividende a été supprimé.
 */
export function dividendGrowthRate(history: readonly DividendYearAmount[], years = DIVIDEND_GROWTH_YEARS): number | undefined {
  const last = history.at(-1);
  if (!last || years <= 0) return undefined;
  const start = history.find((entry) => entry.year === last.year - years);
  if (!start || start.amountPerShare <= 0) return undefined;
  return (last.amountPerShare / start.amountPerShare) ** (1 / years) - 1;
}

/** Hausses strictes d'une année sur l'autre, comptées à rebours depuis l'an dernier. */
export function dividendIncreaseStreak(history: readonly DividendYearAmount[]): number {
  let streak = 0;
  for (let index = history.length - 1; index > 0; index -= 1) {
    const current = history[index];
    const previous = history[index - 1];
    if (!current || !previous || previous.amountPerShare <= 0 || current.amountPerShare <= previous.amountPerShare) break;
    streak += 1;
  }
  return streak;
}

export function summarizeDividendGrowth(events: readonly { date: string; amount: number }[], currentYear: number): DividendGrowthSummary {
  const history = annualDividendHistory(events, currentYear);
  const increaseStreak = dividendIncreaseStreak(history);
  return { history, growthRate: dividendGrowthRate(history), increaseStreak, aristocrat: increaseStreak >= ARISTOCRAT_MIN_YEARS };
}
