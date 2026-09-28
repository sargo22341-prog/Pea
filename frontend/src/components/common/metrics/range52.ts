/**
 * Position d'un cours dans sa fourchette 52 semaines, partagée par la fiche actif (curseur
 * détaillé) et le dashboard (micro-jauge sous le cours).
 */

/** Au-delà de cette part de la fourchette, le cours est considéré proche de son plus haut. */
export const RANGE52_HIGH_ZONE = 0.7;
/** En deçà de cette part de la fourchette, le cours est considéré proche de son plus bas. */
export const RANGE52_LOW_ZONE = 0.3;

export type Range52Tone = "green" | "amber" | "red";

export interface Range52Position {
  /** Position du cours entre le plus bas (0) et le plus haut (1), bornée. */
  ratio: number;
  tone: Range52Tone;
  /** Écart au plus haut en fraction (−0,12 = 12 % sous le plus haut, 0 au plus haut). */
  distanceFromHigh: number;
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/** Absent si l'une des bornes ou le cours manque, ou si la fourchette est vide. */
export function range52Position(low: number | undefined, high: number | undefined, price: number | undefined): Range52Position | undefined {
  if (!isNumber(low) || !isNumber(high) || !isNumber(price) || high <= low || high <= 0) return undefined;
  const ratio = Math.max(0, Math.min(1, (price - low) / (high - low)));
  const tone: Range52Tone = ratio > RANGE52_HIGH_ZONE ? "green" : ratio < RANGE52_LOW_ZONE ? "red" : "amber";
  return { ratio, tone, distanceFromHigh: Math.min(0, price / high - 1) };
}

export const RANGE52_FILL_CLASSES: Record<Range52Tone, string> = {
  green: "bg-mint shadow-[0_0_14px_rgba(74,222,128,0.2)]",
  amber: "bg-amber shadow-[0_0_14px_rgba(251,191,36,0.18)]",
  red: "bg-coral shadow-[0_0_14px_rgba(251,113,133,0.2)]"
};

export const RANGE52_THUMB_CLASSES: Record<Range52Tone, string> = {
  green: "bg-mint shadow-[0_0_16px_rgba(74,222,128,0.5)]",
  amber: "bg-amber shadow-[0_0_16px_rgba(251,191,36,0.42)]",
  red: "bg-coral shadow-[0_0_16px_rgba(251,113,133,0.48)]"
};
