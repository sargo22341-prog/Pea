import type { AssetFundAllocation, AssetFundAnnualReturn, AssetFundDetails, AssetFundHolding, AssetFundRisk, AssetFundTrailingReturns } from "@pea/shared";
import { rawArray, rawRecord, type YahooSummaryRaw } from "../../yahoo.raw.js";
import { rawDate, rawNonZeroNumber, rawNumber, rawString } from "../../utils/raw-values.js";

/** Nombre de lignes détenues conservées : Yahoo n'en publie de toute façon que dix. */
export const FUND_TOP_HOLDINGS_LIMIT = 10;
/** Période de référence des statistiques de risque affichées. */
const FUND_RISK_PERIOD = "3y";
/** Au-delà de cette somme, des pondérations censées totaliser 1 sont en réalité des pourcentages. */
const PERCENT_SUM_THRESHOLD = 1.5;
/** Yahoo date au 1er janvier 1970 les blocs de rendements qu'il remplit de zéros. */
const EMPTY_BLOCK_YEAR = 1970;

type FundPerformanceRaw = NonNullable<YahooSummaryRaw["fundPerformance"]>;

function fromPercentPoints(value: number | undefined) {
  return value === undefined ? undefined : value / 100;
}

function sectorWeightingsFromSummary(summary: YahooSummaryRaw): AssetFundDetails["sectorWeightings"] {
  const weightings = rawArray<unknown>(summary.topHoldings?.sectorWeightings).flatMap((entry) =>
    Object.entries(rawRecord(entry))
      .map(([key, value]) => ({ key, value: rawNumber(value) ?? 0 }))
      .filter(({ value }) => value > 0)
  );
  return weightings.length ? weightings : undefined;
}

/** Lignes détenues triées par poids ; les pondérations exprimées en pourcentage sont ramenées en fraction. */
export function holdingsFromSummary(summary: YahooSummaryRaw): AssetFundHolding[] | undefined {
  const holdings = rawArray<unknown>(summary.topHoldings?.holdings).flatMap((entry): AssetFundHolding[] => {
    const row = rawRecord(entry);
    const name = rawString(row["holdingName"]) ?? rawString(row["symbol"]);
    const weight = rawNumber(row["holdingPercent"]);
    if (!name || weight === undefined || weight <= 0) return [];
    return [{ symbol: rawString(row["symbol"]), name, weight }];
  });
  if (!holdings.length) return undefined;
  const expressedInPercent = holdings.some((holding) => holding.weight > 1);
  return holdings
    .map((holding) => (expressedInPercent ? { ...holding, weight: holding.weight / 100 } : holding))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, FUND_TOP_HOLDINGS_LIMIT);
}

export function allocationFromSummary(summary: YahooSummaryRaw): AssetFundAllocation | undefined {
  const topHoldings = summary.topHoldings;
  if (!topHoldings) return undefined;
  const otherParts = [topHoldings.otherPosition, topHoldings.preferredPosition, topHoldings.convertiblePosition].map((value) => rawNumber(value) ?? 0);
  const raw = {
    stock: rawNumber(topHoldings.stockPosition) ?? 0,
    bond: rawNumber(topHoldings.bondPosition) ?? 0,
    cash: rawNumber(topHoldings.cashPosition) ?? 0,
    other: otherParts.reduce((sum, value) => sum + value, 0)
  };
  const total = raw.stock + raw.bond + raw.cash + raw.other;
  if (total <= 0) return undefined;
  const scale = total > PERCENT_SUM_THRESHOLD ? 100 : 1;
  return { stock: raw.stock / scale, bond: raw.bond / scale, cash: raw.cash / scale, other: raw.other / scale };
}

export function trailingReturnsFromPerformance(performance: FundPerformanceRaw): AssetFundTrailingReturns | undefined {
  const trailing = performance.trailingReturns ?? {};
  const returns = {
    ytd: rawNonZeroNumber(trailing.ytd),
    oneYear: rawNonZeroNumber(trailing.oneYear),
    threeYear: rawNonZeroNumber(trailing.threeYear),
    fiveYear: rawNonZeroNumber(trailing.fiveYear),
    tenYear: rawNonZeroNumber(trailing.tenYear)
  };
  if (Object.values(returns).every((value) => value === undefined)) return undefined;
  const asOfDate = rawDate(trailing.asOfDate);
  const validAsOfDate = asOfDate && new Date(asOfDate).getUTCFullYear() > EMPTY_BLOCK_YEAR ? asOfDate : undefined;
  return { asOfDate: validAsOfDate, ...returns };
}

export function annualReturnsFromPerformance(performance: FundPerformanceRaw): AssetFundAnnualReturn[] | undefined {
  const rows = rawArray<unknown>(performance.annualTotalReturns?.returns).flatMap((entry): AssetFundAnnualReturn[] => {
    const row = rawRecord(entry);
    const year = rawNumber(row["year"]);
    const value = rawNumber(row["annualValue"]);
    return year !== undefined && Number.isInteger(year) && value !== undefined ? [{ year, value }] : [];
  });
  if (!rows.length || rows.every((row) => row.value === 0)) return undefined;
  return rows.sort((a, b) => a.year - b.year);
}

/** Yahoo publie volatilité, alpha et R² en points de pourcentage : ils sont ramenés en fractions. */
export function riskFromPerformance(performance: FundPerformanceRaw): AssetFundRisk | undefined {
  const row = rawArray<unknown>(performance.riskOverviewStatistics?.riskStatistics)
    .map((entry) => rawRecord(entry))
    .find((entry) => entry["year"] === FUND_RISK_PERIOD);
  if (!row) return undefined;
  const risk: AssetFundRisk = {
    volatility: fromPercentPoints(rawNonZeroNumber(row["stdDev"])),
    sharpe: rawNumber(row["sharpeRatio"]),
    beta: rawNonZeroNumber(row["beta"]),
    alpha: fromPercentPoints(rawNumber(row["alpha"])),
    rSquared: fromPercentPoints(rawNonZeroNumber(row["rSquared"]))
  };
  return Object.values(risk).some((value) => value !== undefined) ? risk : undefined;
}

export function fundDetailsFromSummary(summary: YahooSummaryRaw): AssetFundDetails | undefined {
  const profile = summary.fundProfile;
  if (!profile || !Object.keys(profile).length) return undefined;
  const fees = profile.feesExpensesInvestment ?? {};
  const performance = summary.fundPerformance;
  return {
    family: rawString(profile.family),
    annualReportExpenseRatio: rawNumber(fees.annualReportExpenseRatio),
    annualHoldingsTurnover: rawNumber(fees.annualHoldingsTurnover),
    totalNetAssets: rawNumber(fees.totalNetAssets),
    sectorWeightings: sectorWeightingsFromSummary(summary),
    holdings: holdingsFromSummary(summary),
    allocation: allocationFromSummary(summary),
    trailingReturns: performance ? trailingReturnsFromPerformance(performance) : undefined,
    annualReturns: performance ? annualReturnsFromPerformance(performance) : undefined,
    risk: performance ? riskFromPerformance(performance) : undefined
  };
}
