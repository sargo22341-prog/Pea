import type { AssetAnalystConsensus } from "../fundamentals/analysts.js";
import type { AssetFundDetails } from "../fundamentals/fund.js";
import type { AssetFinancialHealth } from "../fundamentals/health.js";
import type { AssetValuation } from "../fundamentals/valuation.js";
import type { CurrencyCode } from "./core.js";

/** Nombre d'actifs comparés côte à côte (`/compare?symbols=A,B,C`). */
export const COMPARE_MIN_SYMBOLS = 2;
export const COMPARE_MAX_SYMBOLS = 4;

/** Dividende tel que publié par Yahoo (`summaryDetail`) ; rendement et distribution en fractions. */
export interface CompareDividend {
  yield?: number | undefined;
  rate?: number | undefined;
  payoutRatio?: number | undefined;
}

/**
 * Colonne du comparateur : blocs déjà exposés par la fiche actif, lus depuis le cache fundamentals.
 * `unavailable` signale un symbole inconnu ou sans données (colonne affichée « n/a »).
 */
export interface CompareAssetDto {
  symbol: string;
  name: string;
  isEtf: boolean;
  currency?: CurrencyCode | undefined;
  price?: number | undefined;
  valuation?: AssetValuation | undefined;
  financialHealth?: AssetFinancialHealth | undefined;
  dividend: CompareDividend;
  analystConsensus?: AssetAnalystConsensus | undefined;
  fundDetails?: Pick<AssetFundDetails, "annualReportExpenseRatio" | "totalNetAssets" | "trailingReturns" | "risk"> | undefined;
  stale?: boolean;
  unavailable?: boolean;
}
