import { useEffect, useMemo, useState } from "react";
import { AssetIcon } from "../../components/common/AssetIcon";
import { CountryAllocationChart } from "../../components/charts/CountryAllocationChart";
import { FinancialComboChart } from "../../components/charts/FinancialComboChart";
import { NetMarginBarChart } from "../../components/charts/NetMarginBarChart";
import { PortfolioTreemap } from "../../components/charts/PortfolioTreemap";
import { SectorAllocationChart } from "../../components/charts/SectorAllocationChart";
import { EmptyState } from "../../components/common/EmptyState";
import { useAsync } from "../../hooks/useAsync";
import { useMarketEventReload } from "../../hooks/useMarketEventReload";
import { api } from "../../lib/api";

type ChartKey = "country" | "sector" | "treemap" | "netMargin" | "financials";

const chartOptions: Array<{ key: ChartKey; label: string }> = [
  { key: "country", label: "Répartition par pays" },
  { key: "sector", label: "Répartition par secteur" },
  { key: "treemap", label: "Treemap du portefeuille" },
  { key: "netMargin", label: "Marges nettes par entreprise" },
  { key: "financials", label: "Revenue / Net Income / Marge" }
];

export function AnalysisPage() {
  const [selectedChart, setSelectedChart] = useState<ChartKey>("country");
  const [selectedFinancialSymbol, setSelectedFinancialSymbol] = useState("");
  const analysis = useAsync((signal) => api.portfolioAnalysis(signal));
  const analysisReload = analysis.reload;
  const activeOption = useMemo(() => chartOptions.find((option) => option.key === selectedChart) ?? chartOptions[0], [selectedChart]);
  const selectedFinancialAsset = useMemo(
    () =>
      analysis.data?.financialsByAsset.find((asset) => asset.symbol === selectedFinancialSymbol) ??
      analysis.data?.financialsByAsset[0],
    [analysis.data, selectedFinancialSymbol]
  );

  useEffect(() => {
    document.title = "Analysis | PEA Portfolio";
    return () => {
      document.title = "PEA Portfolio";
    };
  }, []);

  useMarketEventReload({
    eventTypes: ["analysis-updated"],
    reload: analysisReload
  });

  useEffect(() => {
    if (!selectedFinancialSymbol && analysis.data?.financialsByAsset[0]) {
      setSelectedFinancialSymbol(analysis.data.financialsByAsset[0].symbol);
    }
  }, [analysis.data, selectedFinancialSymbol]);

  const hasAnyData = Boolean(
    analysis.data &&
    (analysis.data.countryAllocation.length ||
      analysis.data.sectorAllocation.length ||
      analysis.data.treemap.length ||
      analysis.data.netMargins.length ||
      analysis.data.financialsByAsset.length ||
      analysis.data.financials.length)
  );

  function renderChart() {
    if (!analysis.data) return null;
    if (selectedChart === "sector") return <SectorAllocationChart data={analysis.data.sectorAllocation} />;
    if (selectedChart === "treemap") return <PortfolioTreemap data={analysis.data.treemap} />;
    if (selectedChart === "netMargin") return <NetMarginBarChart data={analysis.data.netMargins} />;
    if (selectedChart === "financials") return <FinancialComboChart data={selectedFinancialAsset?.financials ?? []} />;
    return <CountryAllocationChart data={analysis.data.countryAllocation} />;
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Analyse</h1>
          <p className="muted">Lecture visuelle du poids de chaque ligne du portefeuille.</p>
        </div>
        <label className="grid gap-1 text-sm text-slate-300 sm:w-80">
          <span>Graphique</span>
          <select className="input" onChange={(event) => setSelectedChart(event.target.value as ChartKey)} value={selectedChart}>
            {chartOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {analysis.loading ? (
        <div className="card p-6">Chargement...</div>
      ) : analysis.error ? (
        <div className="rounded-lg border border-coral/40 bg-coral/10 p-4 text-sm text-rose-100">
          {analysis.error || "Impossible de charger l'analyse du portefeuille."}
        </div>
      ) : !hasAnyData ? (
        <EmptyState />
      ) : (
        <section className="card min-w-0 p-3 sm:p-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">{activeOption.label}</h2>
            {analysis.data?.stale ? <span className="text-xs text-amber">Données partielles ou en cache</span> : null}
          </div>
          {selectedChart === "financials" && analysis.data?.financialsByAsset.length ? (
            <label className="mb-4 grid gap-1 text-sm text-slate-300 sm:max-w-sm">
              <span>Action</span>
              <select className="input" onChange={(event) => setSelectedFinancialSymbol(event.target.value)} value={selectedFinancialAsset?.symbol ?? ""}>
                {analysis.data.financialsByAsset.map((asset) => (
                  <option key={asset.symbol} value={asset.symbol}>
                    {asset.name}
                  </option>
                ))}
              </select>
              {selectedFinancialAsset ? (
                <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-400">
                  <AssetIcon className="h-7 w-7" symbol={selectedFinancialAsset.symbol} />
                  <span className="truncate">{selectedFinancialAsset.name}</span>
                </span>
              ) : null}
            </label>
          ) : null}
          {renderChart()}
        </section>
      )}
    </div>
  );
}
