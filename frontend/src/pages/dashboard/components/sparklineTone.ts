import type { PositionRangePerformance } from "@pea/shared";

export function sparklineTone(position: PositionRangePerformance): "positive" | "negative" | "neutral" {
  if (position.intervalPerformanceValue > 0) return "positive";
  if (position.intervalPerformanceValue < 0) return "negative";
  return "neutral";
}
