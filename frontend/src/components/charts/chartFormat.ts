export const chartColors = ["#38bdf8", "#4ade80", "#fbbf24", "#fb7185", "#a78bfa", "#2dd4bf", "#f97316", "#e879f9"];

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0)} %`;
}

export function compactMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "EUR"
  }).format(Number.isFinite(value) ? value : 0);
}

