import type { ScreenerFilters, ScreenerRow, ScreenerSortKey } from "@pea/shared";
import { formatCompactMoney, formatFractionPercent, formatRatio, MISSING_VALUE } from "../../lib/format-metrics";

/** Filtres de départ : titres éligibles au PEA uniquement. */
export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = { peaOnly: true };

/** Préréglages proposés d'office (les filtres enregistrés par l'utilisateur s'y ajoutent). */
export const BUILT_IN_PRESETS: readonly { key: "yield" | "value" | "growth"; filters: ScreenerFilters }[] = [
  { key: "yield", filters: { peaOnly: true, assetType: "stock", minDividendYield: 0.04 } },
  { key: "value", filters: { peaOnly: true, assetType: "stock", maxTrailingPE: 12 } },
  { key: "growth", filters: { peaOnly: true, minChange52w: 0.15, maxDistanceFromHigh: 0.1 } }
];

export const SCREENER_COLUMNS = ["trailingPE", "dividendYield", "marketCap", "sector", "country", "change52w", "distanceFromHigh"] as const;
export type ScreenerColumn = (typeof SCREENER_COLUMNS)[number];

/** Colonnes affichées par défaut ; les autres s'ajoutent depuis le menu « Colonnes ». */
export const DEFAULT_COLUMNS: readonly ScreenerColumn[] = ["trailingPE", "dividendYield", "marketCap"];

const SORTABLE: Partial<Record<ScreenerColumn, ScreenerSortKey>> = {
  trailingPE: "trailingPE",
  dividendYield: "dividendYield",
  marketCap: "marketCap",
  change52w: "change52w",
  distanceFromHigh: "distanceFromHigh"
};

export function columnSortKey(column: ScreenerColumn) {
  return SORTABLE[column];
}

export function formatScreenerCell(column: ScreenerColumn, row: ScreenerRow): string {
  switch (column) {
    case "trailingPE": return formatRatio(row.trailingPE, 1);
    case "dividendYield": return formatFractionPercent(row.dividendYield);
    case "marketCap": return formatCompactMoney(row.marketCap, row.currency ?? "EUR");
    case "sector": return row.sector ?? MISSING_VALUE;
    case "country": return row.country ?? MISSING_VALUE;
    case "change52w": return formatFractionPercent(row.change52w, { signed: true });
    case "distanceFromHigh": return row.distanceFromHigh === undefined ? MISSING_VALUE : formatFractionPercent(-row.distanceFromHigh);
  }
}

/** Nombre de filtres actifs au-delà du périmètre PEA (affiché sur « Plus de filtres »). */
export function activeFilterCount(filters: ScreenerFilters) {
  return Object.entries(filters).filter(([key, value]) => key !== "peaOnly" && value !== undefined && value !== "" && value !== "all").length;
}

/** Valeur saisie dans l'unité affichée (%, milliards) convertie dans l'unité de l'API. */
export function toCanonical(text: string, scale: number): number | undefined {
  if (text.trim() === "") return undefined;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? Number((value / scale).toPrecision(12)) : undefined;
}

export function fromCanonical(value: number | undefined, scale: number): string {
  return value === undefined ? "" : String(Number((value * scale).toPrecision(12)));
}
