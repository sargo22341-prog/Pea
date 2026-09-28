import { useTranslation } from "react-i18next";
import { CHART_FAMILIES, chartFamily, type ChartKey } from "../analysis-charts";

/** Sélecteur d'onglet, regroupé par famille (Répartition / Qualité) ; seuls les onglets avec données sont listés. */
export function AnalysisChartSelect({ charts, value, onChange }: { charts: readonly ChartKey[]; value: ChartKey; onChange: (key: ChartKey) => void }) {
  const { t } = useTranslation("common");

  return (
    <label className="grid gap-1 text-sm text-slate-300 sm:w-80">
      <span>{t("analysis.chart")}</span>
      <select
        className="input"
        onChange={(event) => {
          const next = charts.find((key) => key === event.target.value);
          if (next) onChange(next);
        }}
        value={value}
      >
        {CHART_FAMILIES.map((family) => {
          const familyCharts = charts.filter((key) => chartFamily(key) === family);
          if (!familyCharts.length) return null;
          return (
            <optgroup key={family} label={t(`analysis.families.${family}`)}>
              {familyCharts.map((key) => (
                <option key={key} value={key}>
                  {t(`analysis.charts.${key}`)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
