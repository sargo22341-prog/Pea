/** Centile lineaire sur une serie deja triee par ordre croissant. */
export function percentileOfSorted(sorted: number[], percentile: number) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = ((percentile / 100) * (sorted.length - 1));
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower);
}

/** Centiles demandes pour chaque mois, a partir des trajectoires simulees. */
export function percentilesByMonth(trajectories: number[][], percentiles: number[]): number[][] {
  const monthCount = trajectories[0]?.length ?? 0;
  const results = percentiles.map(() => new Array<number>(monthCount).fill(0));
  const columnValues = new Array<number>(trajectories.length);
  for (let month = 0; month < monthCount; month += 1) {
    for (let index = 0; index < trajectories.length; index += 1) columnValues[index] = trajectories[index]![month]!;
    const sorted = [...columnValues].sort((a, b) => a - b);
    percentiles.forEach((percentile, index) => {
      results[index]![month] = percentileOfSorted(sorted, percentile);
    });
  }
  return results;
}
