import { isMeaningfulMultiple, type CompareAssetDto } from "@pea/shared";
import { formatCompactMoney, formatFractionPercent, formatRatio, MISSING_VALUE } from "../../lib/format-metrics";
import { money } from "../../lib/format";
import { analystTarget } from "../../utils/analyst-target";

export const COMPARE_FAMILIES = ["valuation", "health", "dividend", "analysts", "fund"] as const;
export type CompareFamily = (typeof COMPARE_FAMILIES)[number];

/** Sens de lecture : la meilleure valeur d'une ligne est la plus haute ou la plus basse. */
type Better = "higher" | "lower";

export interface CompareMetric {
  key: string;
  family: CompareFamily;
  /** Clé i18n (espace `asset`, déjà utilisée par la fiche actif, ou `compare`). */
  labelKey: string;
  read: (asset: CompareAssetDto) => number | undefined;
  format: (value: number, asset: CompareAssetDto) => string;
  better?: Better;
  /** Ligne propre aux actions ou aux ETF : « n/a » pour l'autre type. */
  appliesTo?: "stock" | "etf";
  /** Multiple (PER, P/B…) : une valeur négative ou nulle n'est pas significative. */
  multiple?: boolean;
}

const percentValue = (value: number) => formatFractionPercent(value);
const signedPercent = (value: number) => formatFractionPercent(value, { signed: true });
const ratio = (value: number) => formatRatio(value);
const compactMoney = (value: number, asset: CompareAssetDto) => formatCompactMoney(value, asset.currency ?? "EUR");

export const COMPARE_METRICS: readonly CompareMetric[] = [
  { key: "trailingPE", family: "valuation", labelKey: "asset:valuation.trailingPE", read: (a) => a.valuation?.trailingPE, format: ratio, better: "lower", multiple: true },
  { key: "forwardPE", family: "valuation", labelKey: "compare:metrics.forwardPE", read: (a) => a.valuation?.forwardPE, format: ratio, better: "lower", multiple: true },
  { key: "priceToBook", family: "valuation", labelKey: "asset:valuation.priceToBook", read: (a) => a.valuation?.priceToBook, format: ratio, better: "lower", multiple: true },
  { key: "enterpriseToEbitda", family: "valuation", labelKey: "asset:valuation.enterpriseToEbitda", read: (a) => a.valuation?.enterpriseToEbitda, format: ratio, better: "lower", multiple: true },
  { key: "marketCap", family: "valuation", labelKey: "asset:valuation.marketCap", read: (a) => a.valuation?.marketCap, format: compactMoney },
  { key: "beta", family: "valuation", labelKey: "asset:valuation.beta", read: (a) => a.valuation?.beta, format: ratio },
  { key: "fiftyTwoWeekChange", family: "valuation", labelKey: "compare:metrics.fiftyTwoWeekChange", read: (a) => a.valuation?.fiftyTwoWeekChange, format: signedPercent, better: "higher" },
  { key: "profitMargin", family: "health", labelKey: "asset:health.metrics.profitMargin", read: (a) => a.financialHealth?.metrics.profitMargin, format: percentValue, better: "higher", appliesTo: "stock" },
  { key: "operatingMargin", family: "health", labelKey: "asset:health.metrics.operatingMargin", read: (a) => a.financialHealth?.metrics.operatingMargin, format: percentValue, better: "higher", appliesTo: "stock" },
  { key: "returnOnEquity", family: "health", labelKey: "asset:health.metrics.returnOnEquity", read: (a) => a.financialHealth?.metrics.returnOnEquity, format: percentValue, better: "higher", appliesTo: "stock" },
  {
    key: "debtToEquity", family: "health", labelKey: "asset:health.metrics.debtToEquity", format: (value) => `${formatRatio(value, 0)} %`, better: "lower", appliesTo: "stock",
    // Banques et assurances : l'endettement ne se compare pas (même règle que la fiche actif).
    read: (a) => (a.financialHealth?.isFinancialSector ? undefined : a.financialHealth?.metrics.debtToEquity)
  },
  { key: "revenueGrowth", family: "health", labelKey: "asset:health.metrics.revenueGrowth", read: (a) => a.financialHealth?.metrics.revenueGrowth, format: signedPercent, better: "higher", appliesTo: "stock" },
  { key: "earningsGrowth", family: "health", labelKey: "asset:health.metrics.earningsGrowth", read: (a) => a.financialHealth?.metrics.earningsGrowth, format: signedPercent, better: "higher", appliesTo: "stock" },
  { key: "dividendYield", family: "dividend", labelKey: "compare:metrics.dividendYield", read: (a) => a.dividend.yield, format: percentValue, better: "higher" },
  { key: "dividendRate", family: "dividend", labelKey: "compare:metrics.dividendRate", read: (a) => a.dividend.rate, format: (value, a) => money(value, a.currency ?? "EUR") },
  { key: "payoutRatio", family: "dividend", labelKey: "compare:metrics.payoutRatio", read: (a) => a.dividend.payoutRatio, format: percentValue, appliesTo: "stock" },
  { key: "recommendationMean", family: "analysts", labelKey: "compare:metrics.recommendationMean", read: (a) => a.analystConsensus?.recommendationMean, format: ratio, better: "lower", appliesTo: "stock" },
  { key: "targetPotential", family: "analysts", labelKey: "asset:analyst.potential", read: (a) => analystTarget(a.analystConsensus)?.potential, format: signedPercent, better: "higher", appliesTo: "stock" },
  { key: "analystCount", family: "analysts", labelKey: "asset:analyst.analystCount", read: (a) => a.analystConsensus?.numberOfAnalystOpinions, format: (value) => formatRatio(value, 0), appliesTo: "stock" },
  { key: "expenseRatio", family: "fund", labelKey: "asset:etf.fees", read: (a) => a.fundDetails?.annualReportExpenseRatio, format: (value) => formatFractionPercent(value, { digits: 2 }), better: "lower", appliesTo: "etf" },
  { key: "totalNetAssets", family: "fund", labelKey: "asset:etf.netAssets", read: (a) => a.fundDetails?.totalNetAssets, format: compactMoney, appliesTo: "etf" },
  { key: "oneYearReturn", family: "fund", labelKey: "compare:metrics.oneYearReturn", read: (a) => a.fundDetails?.trailingReturns?.oneYear, format: signedPercent, better: "higher", appliesTo: "etf" },
  { key: "threeYearReturn", family: "fund", labelKey: "compare:metrics.threeYearReturn", read: (a) => a.fundDetails?.trailingReturns?.threeYear, format: signedPercent, better: "higher", appliesTo: "etf" },
  { key: "volatility", family: "fund", labelKey: "asset:etf.risk.volatility", read: (a) => a.fundDetails?.risk?.volatility, format: percentValue, better: "lower", appliesTo: "etf" },
  { key: "sharpe", family: "fund", labelKey: "compare:metrics.sharpe", read: (a) => a.fundDetails?.risk?.sharpe, format: ratio, better: "higher", appliesTo: "etf" }
];

function applies(metric: CompareMetric, asset: CompareAssetDto) {
  if (asset.unavailable) return false;
  if (metric.appliesTo === "stock") return !asset.isEtf;
  if (metric.appliesTo === "etf") return asset.isEtf;
  return true;
}

/** Valeur comparable d'une cellule, ou `undefined` (non applicable, absente, multiple non significatif). */
export function metricValue(metric: CompareMetric, asset: CompareAssetDto): number | undefined {
  if (!applies(metric, asset)) return undefined;
  const value = metric.read(asset);
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (metric.multiple && !isMeaningfulMultiple(value)) return undefined;
  return value;
}

export function formatMetric(metric: CompareMetric, asset: CompareAssetDto): string {
  const value = metricValue(metric, asset);
  return value === undefined ? MISSING_VALUE : metric.format(value, asset);
}

/**
 * Symboles portant la meilleure valeur d'une ligne. Rien n'est mis en avant sans sens de lecture
 * ou quand moins de deux actifs ont une valeur comparable.
 */
export function bestSymbols(metric: CompareMetric, assets: readonly CompareAssetDto[]): ReadonlySet<string> {
  if (!metric.better) return new Set();
  const values = assets.flatMap((asset) => {
    const value = metricValue(metric, asset);
    return value === undefined ? [] : [{ symbol: asset.symbol, value }];
  });
  if (values.length < 2) return new Set();
  const target = metric.better === "higher" ? Math.max(...values.map((item) => item.value)) : Math.min(...values.map((item) => item.value));
  return new Set(values.filter((item) => item.value === target).map((item) => item.symbol));
}

/** Lignes d'une famille ayant au moins une valeur ; une famille sans ligne n'est pas affichée. */
export function familyMetrics(family: CompareFamily, assets: readonly CompareAssetDto[]) {
  return COMPARE_METRICS.filter((metric) => metric.family === family && assets.some((asset) => metricValue(metric, asset) !== undefined));
}
