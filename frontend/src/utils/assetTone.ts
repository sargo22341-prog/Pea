import type { HealthRating } from "@pea/shared";

export type InfoTone = "positive" | "negative" | "muted" | "warning";
export type IconTone = "green" | "red" | "amber" | "sky" | "cyan" | "slate";

export function toneFromNumber(value?: number): InfoTone | undefined {
  if (value == null || !Number.isFinite(value)) return "muted";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return undefined;
}

export function toneClass(tone?: InfoTone) {
  if (tone === "positive") return "text-mint drop-shadow-[0_0_10px_rgba(74,222,128,0.18)]";
  if (tone === "negative") return "text-coral drop-shadow-[0_0_10px_rgba(251,113,133,0.16)]";
  if (tone === "warning") return "text-amber";
  if (tone === "muted") return "text-slate-500";
  return "";
}

export function iconToneClass(tone: IconTone) {
  if (tone === "green") return "border-mint/25 bg-mint/10 text-mint shadow-[0_0_18px_rgba(74,222,128,0.18)]";
  if (tone === "red") return "border-coral/25 bg-coral/10 text-coral shadow-[0_0_18px_rgba(251,113,133,0.16)]";
  if (tone === "amber") return "border-amber/25 bg-amber/10 text-amber shadow-[0_0_18px_rgba(251,191,36,0.15)]";
  if (tone === "sky") return "border-sky/25 bg-sky/10 text-sky shadow-[0_0_18px_rgba(56,189,248,0.16)]";
  if (tone === "cyan") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.14)]";
  return "border-white/[0.08] bg-white/[0.04] text-slate-300";
}

/** Couleurs de verdict (santé financière, tendance) : mêmes teintes que le consensus. */
export function ratingToneClass(rating: HealthRating) {
  if (rating === "good") return "border-mint/30 bg-mint/10 text-mint";
  if (rating === "fair") return "border-yellow-300/30 bg-yellow-300/10 text-yellow-300";
  return "border-red-400/30 bg-red-400/10 text-red-400";
}

/** Remplissage d'une jauge notée (taux de distribution, couverture) : mêmes teintes que les pastilles. */
export function ratingFillClass(rating: HealthRating) {
  if (rating === "good") return "bg-mint";
  if (rating === "fair") return "bg-yellow-300";
  return "bg-red-400";
}

export function ratingInfoTone(rating: HealthRating | undefined): InfoTone | undefined {
  if (rating === "good") return "positive";
  if (rating === "fair") return "warning";
  if (rating === "weak") return "negative";
  return undefined;
}

/** Échelle de recommandation des analystes (1 = achat fort, 5 = vente), du vert au rouge. */
export const CONSENSUS_SCALE = [
  { key: "strongBuy", text: "text-mint", bar: "bg-emerald-600" },
  { key: "buy", text: "text-lime-400", bar: "bg-lime-500" },
  { key: "hold", text: "text-yellow-300", bar: "bg-yellow-400" },
  { key: "reduce", text: "text-orange-400", bar: "bg-orange-500" },
  { key: "sell", text: "text-red-400", bar: "bg-red-500" }
] as const;

/** Clés de traduction (espace `asset`) des recommandations consensuelles renvoyées par Yahoo. */
const RECOMMENDATION_LABEL_KEYS: Record<string, string> = {
  strong_buy: "analyst.strongBuy",
  buy: "analyst.buy",
  hold: "analyst.hold",
  underperform: "analyst.reduce",
  sell: "analyst.sell"
};

/** Clé de traduction d'une recommandation ; une clé inconnue est affichée telle quelle. */
export function recommendationLabelKey(recommendationKey: string) {
  return RECOMMENDATION_LABEL_KEYS[recommendationKey] ?? recommendationKey;
}

/** Échelon de l'échelle de consensus correspondant à une note moyenne entre 1 et 5. */
export function consensusStep(score: number) {
  const index = score <= 1.5 ? 0 : score <= 2.5 ? 1 : score <= 3.5 ? 2 : score <= 4.5 ? 3 : 4;
  return CONSENSUS_SCALE[index];
}
