import type { ReactNode } from "react";
import { numberFormatter } from "../../lib/format";

export const chartColors = ["#38bdf8", "#4ade80", "#fbbf24", "#fb7185", "#a78bfa", "#2dd4bf", "#f97316", "#e879f9"] as const;

/** Couleur de palette pour un index quelconque, en rebouclant sur la palette. */
export function paletteColor<T extends string>(palette: readonly [T, ...T[]], index: number): T {
  return palette[index % palette.length] ?? palette[0];
}

/** Texte d'un libelle Recharts (nombre ou chaine) ; tout autre noeud React donne une chaine vide. */
export function labelText(label: ReactNode): string {
  return typeof label === "string" || typeof label === "number" ? String(label) : "";
}

export function formatPercent(value: number) {
  return `${numberFormatter({ maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0)} %`;
}

export function compactMoney(value: number) {
  return numberFormatter({
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "EUR"
  }).format(Number.isFinite(value) ? value : 0);
}


/** Durée des animations natives Recharts, commune à tous les graphiques de l'application. */
export const CHART_ANIMATION_MS = 600;

/** Couleurs des moyennes mobiles du graphique de cours, distinctes de la courbe principale. */
export const MOVING_AVERAGE_COLORS = { ma50: "#fbbf24", ma200: "#a78bfa" } as const;
