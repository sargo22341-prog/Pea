import type { PortfolioAnalysis } from "@pea/shared";

export type ChartKey =
  | "country"
  | "sector"
  | "treemap"
  | "capitalization"
  | "lookThrough"
  | "netMargin"
  | "financials"
  | "valuation"
  | "dividendSustainability"
  | "correlation";

export type ChartFamily = "allocation" | "quality";

interface ChartOption {
  key: ChartKey;
  family: ChartFamily;
  /** Un onglet sans donnée n'est pas proposé (règle « pas de carte vide »). */
  hasData: (analysis: PortfolioAnalysis) => boolean;
}

/** Nombre minimal de lignes pour qu'une matrice de corrélation ait un sens. */
const CORRELATION_MIN_ASSETS = 2;

/**
 * Onglets de la page Analyse, regroupés en deux familles dans le sélecteur : la répartition du
 * portefeuille, puis la qualité des entreprises et du portefeuille dans son ensemble.
 */
const CHART_OPTIONS: readonly ChartOption[] = [
  { key: "country", family: "allocation", hasData: (data) => data.countryAllocation.length > 0 },
  { key: "sector", family: "allocation", hasData: (data) => data.sectorAllocation.length > 0 },
  { key: "treemap", family: "allocation", hasData: (data) => data.treemap.length > 0 },
  { key: "capitalization", family: "allocation", hasData: (data) => data.capitalizationAllocation.length > 0 },
  { key: "lookThrough", family: "allocation", hasData: (data) => data.lookThrough.etfCount > 0 },
  { key: "netMargin", family: "quality", hasData: (data) => data.netMargins.length > 0 },
  { key: "financials", family: "quality", hasData: (data) => data.financialsByAsset.length > 0 },
  { key: "valuation", family: "quality", hasData: (data) => [data.valuation.trailingPE, data.valuation.dividendYield, data.valuation.beta].some((metric) => metric.value !== undefined) },
  { key: "dividendSustainability", family: "quality", hasData: (data) => data.dividendSustainability.length > 0 },
  { key: "correlation", family: "quality", hasData: (data) => (data.correlation?.assets.length ?? 0) >= CORRELATION_MIN_ASSETS }
];

export const CHART_FAMILIES: readonly ChartFamily[] = ["allocation", "quality"];

export function availableCharts(analysis: PortfolioAnalysis | null | undefined): ChartKey[] {
  if (!analysis) return [];
  return CHART_OPTIONS.filter((option) => option.hasData(analysis)).map((option) => option.key);
}

export function chartFamily(key: ChartKey): ChartFamily {
  return CHART_OPTIONS.find((option) => option.key === key)?.family ?? "allocation";
}
