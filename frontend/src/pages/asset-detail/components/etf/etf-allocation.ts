import type { AllocationChartItem, AssetFundAllocation, AssetFundDetails } from "@pea/shared";

const ALLOCATION_KEYS = ["stock", "bond", "cash", "other"] as const;
export type AllocationKey = (typeof ALLOCATION_KEYS)[number];

/** Classes d'actifs non nulles, triées par poids, au format des graphiques de répartition. */
export function allocationChartItems(allocation: AssetFundAllocation | undefined, label: (key: AllocationKey) => string): AllocationChartItem[] {
  if (!allocation) return [];
  return ALLOCATION_KEYS.flatMap((key) => {
    const value = allocation[key] ?? 0;
    return value > 0 ? [{ name: label(key), value, percentage: value * 100, symbols: [] }] : [];
  }).sort((a, b) => b.value - a.value);
}

/** Secteurs Yahoo (`technology`, `healthcare`...) traduits et triés par poids. */
export function sectorChartItems(weightings: AssetFundDetails["sectorWeightings"], label: (key: string) => string): AllocationChartItem[] {
  return (weightings ?? [])
    .filter((item) => item.value > 0)
    .map((item) => ({ name: label(item.key), value: item.value, percentage: item.value * 100, symbols: [] }))
    .sort((a, b) => b.value - a.value);
}
