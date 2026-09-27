/** Centile lineaire sur une serie deja triee par ordre croissant. */
export function percentileOfSorted(sorted: number[], percentile: number) {
  const rank = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) return 0;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

/** Centiles demandes pour chaque mois, a partir des trajectoires simulees. */
export function percentilesByMonth(trajectories: number[][], percentiles: number[]): number[][] {
  const monthCount = trajectories[0]?.length ?? 0;
  const rows = percentiles.map((percentile) => ({ percentile, values: new Array<number>(monthCount).fill(0) }));
  for (let month = 0; month < monthCount; month += 1) {
    // Une seule colonne triee a la fois : la memoire reste proportionnelle au nombre de trajectoires.
    const sorted = trajectories.map((trajectory) => trajectory[month] ?? 0).sort((a, b) => a - b);
    for (const row of rows) row.values[month] = percentileOfSorted(sorted, row.percentile);
  }
  return rows.map((row) => row.values);
}
