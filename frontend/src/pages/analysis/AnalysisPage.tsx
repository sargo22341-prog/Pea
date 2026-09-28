import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/common/EmptyState";
import { MOTION } from "../../components/common/motion";
import { useAsync } from "../../hooks/useAsync";
import { useMarketEventReload } from "../../hooks/useMarketEventReload";
import { api } from "../../lib/api";
import { availableCharts, type ChartKey } from "./analysis-charts";
import { AnalysisChart } from "./components/AnalysisChart";
import { AnalysisChartSelect } from "./components/AnalysisChartSelect";

export function AnalysisPage() {
  const { t } = useTranslation("common");
  const [selectedChart, setSelectedChart] = useState<ChartKey>("country");
  const analysis = useAsync((signal) => api.portfolioAnalysis(signal));
  const analysisReload = analysis.reload;
  const charts = availableCharts(analysis.data);
  // Un onglet devenu vide (données rechargées) laisse la place au premier onglet disponible.
  const activeChart = charts.includes(selectedChart) ? selectedChart : charts[0];

  useEffect(() => {
    document.title = `${t("analysis.title")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  useMarketEventReload({
    eventTypes: ["analysis-updated"],
    reload: analysisReload
  });

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t("analysis.title")}</h1>
          <p className="muted">{t("analysis.subtitle")}</p>
        </div>
        {activeChart ? <AnalysisChartSelect charts={charts} onChange={setSelectedChart} value={activeChart} /> : null}
      </div>

      {analysis.loading ? (
        <div className="card p-6">{t("common.loading")}</div>
      ) : analysis.error ? (
        <div className="rounded-lg border border-coral/40 bg-coral/10 p-4 text-sm text-rose-100">
          {analysis.error || t("analysis.loadError")}
        </div>
      ) : !analysis.data || !activeChart ? (
        <EmptyState />
      ) : (
        <section className="card min-w-0 p-3 sm:p-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">{t(`analysis.charts.${activeChart}`)}</h2>
            {analysis.data.stale ? <span className="text-xs text-amber">{t("analysis.stale")}</span> : null}
          </div>
          <div className={MOTION.rise} key={activeChart}>
            <AnalysisChart analysis={analysis.data} chart={activeChart} />
          </div>
        </section>
      )}
    </div>
  );
}
