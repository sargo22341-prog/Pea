import { freeCashFlowCoverage, type DividendSustainabilityItem, type FinancialStatementRow, type PositionWithMarket } from "@pea/shared";
import { marketInfoFromSummary } from "../../yahoo/fundamentals/mappers/market-info.mapper.js";
import type { Fundamentals } from "./portfolio-analysis.helpers.js";

/**
 * Soutenabilité du dividende d'une action : taux de distribution (`summaryDetail`) et couverture
 * par le flux de trésorerie disponible (derniers comptes annuels en cache). Les notes sont
 * calculées côté frontend par les seuils partagés. Absent pour un ETF ou une ligne sans donnée.
 */
export function dividendSustainabilityItem(
  position: PositionWithMarket,
  fundamentals: Fundamentals | undefined,
  weight: number,
  statementRows: readonly FinancialStatementRow[]
): DividendSustainabilityItem | undefined {
  const payout = fundamentals ? marketInfoFromSummary(fundamentals).payoutRatio : undefined;
  const payoutRatio = payout !== undefined && Number.isFinite(payout) && payout !== 0 ? payout : undefined;
  const fcfCoverage = freeCashFlowCoverage(statementRows)?.coverage;
  if (payoutRatio === undefined && fcfCoverage === undefined) return undefined;
  return { symbol: position.symbol, name: position.name, weight, payoutRatio, fcfCoverage };
}

/** Du dividende le mieux couvert au plus fragile ; une ligne sans taux de distribution passe en dernier. */
export function sortBySustainability(items: DividendSustainabilityItem[]) {
  return items.sort((a, b) => {
    if (a.payoutRatio === undefined || b.payoutRatio === undefined) return Number(a.payoutRatio === undefined) - Number(b.payoutRatio === undefined);
    const aNegative = a.payoutRatio < 0;
    if (aNegative !== b.payoutRatio < 0) return aNegative ? 1 : -1;
    return a.payoutRatio - b.payoutRatio;
  });
}
