import type { CurrencyCode } from "../market.js";

export interface PortfolioDividendMonth {
  month: string;
  amount: number;
}

/**
 * Origine d'un versement : `real` détaché, `announced` date de détachement future publiée par
 * la société (montant déduit du dividende annuel annoncé), `estimated` reprise de l'an dernier.
 */
export type PortfolioDividendStatus = "real" | "announced" | "estimated";

export interface PortfolioDividendEvent {
  symbol: string;
  name: string;
  date: string;
  year: number;
  amountPerShare: number;
  quantity: number;
  totalAmount: number;
  currency: CurrencyCode;
  status: PortfolioDividendStatus;
  annualDividendRate?: number | undefined;
  dividendPercent?: number | undefined;
  yieldOnCostPercent?: number | undefined;
  /** Taux de distribution (dividendes / bénéfice, fraction) lu dans le cache fundamentals. */
  payoutRatio?: number | undefined;
  stale?: boolean | undefined;
}

export interface PortfolioDividends {
  annualEstimatedTotal: number;
  currency: CurrencyCode;
  months: PortfolioDividendMonth[];
  upcoming: PortfolioDividendEvent[];
  past: PortfolioDividendEvent[];
  /** Dividendes annuels attendus au rythme actuel (dividende annuel × quantité détenue). */
  expectedAnnualIncome?: number | undefined;
  /** Valeur de marché actuelle des positions, base de la simulation de réinvestissement. */
  marketValue?: number | undefined;
  stale?: boolean;
}
