/**
 * Rendement sur coût : dividende annuel attendu rapporté au prix de revient, c'est-à-dire la
 * rente réellement obtenue sur la somme investie (et non sur le cours du jour).
 */

/** Rendement sur coût d'une position (fraction) ; absent sans dividende connu ou sans prix de revient. */
export function positionYieldOnCost(annualDividendPerShare: number | undefined, averageBuyPrice: number): number | undefined {
  if (annualDividendPerShare === undefined || !Number.isFinite(annualDividendPerShare) || annualDividendPerShare < 0) return undefined;
  if (!Number.isFinite(averageBuyPrice) || averageBuyPrice <= 0) return undefined;
  return annualDividendPerShare / averageBuyPrice;
}

/**
 * Rendement sur coût du portefeuille, pondéré par le coût : somme des dividendes annuels attendus
 * divisée par le coût total. Les positions sans dividende pèsent dans le coût. Absent tant
 * qu'aucune position ne verse de dividende connu ou que le coût total est nul.
 */
export function portfolioYieldOnCost(positions: readonly { estimatedAnnualDividend?: number | undefined; costBasis: number }[]): number | undefined {
  const totalCost = positions.reduce((sum, position) => sum + (Number.isFinite(position.costBasis) && position.costBasis > 0 ? position.costBasis : 0), 0);
  const dividends = positions.map((position) => position.estimatedAnnualDividend).filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (totalCost <= 0 || !dividends.length) return undefined;
  return dividends.reduce((sum, value) => sum + value, 0) / totalCost;
}
