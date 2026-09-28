import type { PortfolioAnalysis } from "@pea/shared";
import { CountryAllocationChart } from "../../../components/charts/allocation/CountryAllocationChart";
import { PortfolioTreemap } from "../../../components/charts/allocation/PortfolioTreemap";
import { SectorAllocationChart } from "../../../components/charts/allocation/SectorAllocationChart";
import { NetMarginBarChart } from "../../../components/charts/financial/NetMarginBarChart";
import type { ChartKey } from "../analysis-charts";
import { CapitalizationCurrencyPanel } from "./allocation/CapitalizationCurrencyPanel";
import { CorrelationPanel } from "./correlation/CorrelationPanel";
import { DividendSustainabilityPanel } from "./dividends/DividendSustainabilityPanel";
import { FinancialsByAssetPanel } from "./FinancialsByAssetPanel";
import { LookThroughPanel } from "./look-through/LookThroughPanel";
import { PortfolioValuationPanel } from "./valuation/PortfolioValuationPanel";

/** Contenu de l'onglet sélectionné ; seul cet onglet est monté. */
export function AnalysisChart({ chart, analysis }: { chart: ChartKey; analysis: PortfolioAnalysis }) {
  switch (chart) {
    case "country":
      return <CountryAllocationChart data={analysis.countryAllocation} />;
    case "sector":
      return <SectorAllocationChart data={analysis.sectorAllocation} />;
    case "treemap":
      return <PortfolioTreemap data={analysis.treemap} />;
    case "capitalization":
      return <CapitalizationCurrencyPanel capitalization={analysis.capitalizationAllocation} currency={analysis.currencyAllocation} />;
    case "lookThrough":
      return <LookThroughPanel direct={analysis.treemap} lookThrough={analysis.lookThrough} />;
    case "netMargin":
      return <NetMarginBarChart data={analysis.netMargins} />;
    case "financials":
      return <FinancialsByAssetPanel assets={analysis.financialsByAsset} />;
    case "valuation":
      return <PortfolioValuationPanel valuation={analysis.valuation} />;
    case "dividendSustainability":
      return <DividendSustainabilityPanel items={analysis.dividendSustainability} />;
    case "correlation":
      return analysis.correlation ? <CorrelationPanel correlation={analysis.correlation} /> : null;
  }
}
