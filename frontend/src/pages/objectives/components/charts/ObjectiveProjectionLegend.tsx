import { useTranslation } from "react-i18next";
import { projectionRangeOpacity, projectionSeries } from "./projectionChartConfig";

export function ObjectiveProjectionLegend({ showRange, showReal }: { showRange: boolean; showReal: boolean }) {
  const { t } = useTranslation("objectives");
  const items = [
    ...(showReal ? [{ key: "real", line: "solid", ...projectionSeries.real }] : []),
    { key: "projected", line: "dash", ...projectionSeries.projected },
    ...(showRange ? [{ key: "range", line: "band", ...projectionSeries.range }] : []),
    { key: "required", line: "dot", ...projectionSeries.required }
  ];

  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-300">
      {items.map((item) => (
        <span className="inline-flex items-center gap-2" key={item.key} title={t(item.descriptionKey)}>
          <span
            className={item.line === "band" ? "inline-block h-3 w-7 rounded-sm" : "inline-block h-0.5 w-7"}
            style={{
              backgroundColor: item.line === "solid" ? item.color : item.line === "band" ? item.color : "transparent",
              opacity: item.line === "band" ? projectionRangeOpacity * 3 : undefined,
              borderTop: item.line === "dash" ? `2px dashed ${item.color}` : item.line === "dot" ? `2px dotted ${item.color}` : undefined
            }}
          />
          {t(item.labelKey)}
        </span>
      ))}
    </div>
  );
}
