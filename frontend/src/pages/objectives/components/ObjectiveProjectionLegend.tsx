import { useTranslation } from "react-i18next";
import { projectionSeries } from "./projectionChartConfig";

export function ObjectiveProjectionLegend({ showReal }: { showReal: boolean }) {
  const { t } = useTranslation("objectives");
  const items = [
    ...(showReal ? [{ key: "real", line: "solid", ...projectionSeries.real }] : []),
    { key: "projected", line: "dash", ...projectionSeries.projected },
    { key: "required", line: "dot", ...projectionSeries.required }
  ];

  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-300">
      {items.map((item) => (
        <span className="inline-flex items-center gap-2" key={item.key} title={t(item.descriptionKey)}>
          <span
            className="inline-block h-0.5 w-7"
            style={{
              backgroundColor: item.line === "solid" ? item.color : "transparent",
              borderTop: item.line === "dash" ? `2px dashed ${item.color}` : item.line === "dot" ? `2px dotted ${item.color}` : undefined
            }}
          />
          {t(item.labelKey)}
        </span>
      ))}
    </div>
  );
}
