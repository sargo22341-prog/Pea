export type PerformancePoint = {
    date: string;
    value: number;
};

/**
 * Trie les points de performance par instant UTC et supprime les dates invalides.
 */
export function normalizePortfolioPerformanceData<T extends PerformancePoint>(data: T[]) {
    const byDate = new Map<string, T>();
    for (const point of data) {
        if (!point.date || !Number.isFinite(new Date(point.date).getTime()) || !Number.isFinite(point.value)) continue;
        byDate.set(point.date, point);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
