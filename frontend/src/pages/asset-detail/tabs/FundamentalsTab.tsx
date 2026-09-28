import type { AssetDetails } from "@pea/shared";
import { FinancialHealthBlock } from "../components/fundamentals/FinancialHealthBlock";
import { FinancialStatementsCard } from "../components/fundamentals/statements/FinancialStatementsCard";
import { ValuationBlock } from "../components/fundamentals/ValuationBlock";

/** Onglet « Fondamentaux » d'une action : valorisation, santé financière puis états financiers. */
export function FundamentalsTab({ asset }: { asset: AssetDetails }) {
  return (
    <div className="space-y-4">
      {asset.valuation ? <ValuationBlock valuation={asset.valuation} /> : null}
      {asset.financialHealth ? <FinancialHealthBlock health={asset.financialHealth} /> : null}
      <FinancialStatementsCard currency={asset.quote.currency} financials={asset.financials} symbol={asset.quote.symbol} />
    </div>
  );
}
