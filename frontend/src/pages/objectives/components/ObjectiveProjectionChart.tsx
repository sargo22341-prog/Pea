import type { ObjectiveProjection } from "@pea/shared";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "../../../lib/format";
import type { ObjectiveChartRange } from "../types";
import { ObjectiveProjectionLegend } from "./ObjectiveProjectionLegend";
import { ObjectiveProjectionTooltip } from "./ObjectiveProjectionTooltip";
import { ObjectiveReachMarker } from "./ObjectiveReachMarker";
import { projectionSeries } from "./projectionChartConfig";
import { findReachPoint } from "./projectionChartHelpers";

function cutoff(range: ObjectiveChartRange) {
  if (range === "1y") return 12;
  if (range === "5y") return 60;
  return Number.POSITIVE_INFINITY;
}

export function ObjectiveProjectionChart({ projection }: { projection: ObjectiveProjection }) {
  const { t } = useTranslation("objectives");
  const [range, setRange] = useState<ObjectiveChartRange>("all");
  const data = useMemo(() => {
    const limit = cutoff(range);
    const firstFutureIndex = projection.series.findIndex((point) => point.projected !== undefined);
    return projection.series
      .filter((_, index) => firstFutureIndex < 0 || index < firstFutureIndex || index - firstFutureIndex <= limit)
      .map((point) => ({
        ...point,
        label: point.age ? `${Math.round(point.age)} ans` : new Date(point.date).getFullYear().toString()
      }));
  }, [projection.series, range]);
  const reachPoint = useMemo(() => findReachPoint(data), [data]);
  const reachLabel = useMemo(() => {
    if (!reachPoint) return undefined;
    if (Number.isFinite(reachPoint.age) && reachPoint.age > 0) return t("chart.reachableAtAge", { age: Math.round(reachPoint.age) });
    const year = new Date(reachPoint.date).getFullYear();
    return Number.isFinite(year) ? t("chart.reachableInYear", { year }) : t("chart.reachable");
  }, [reachPoint, t]);
  const hasRealData = data.some((point) => Number.isFinite(point.real));

  return (
    <section className="card min-w-0 border border-line bg-panel/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("chart.title")}</h2>
        <div className="flex rounded-md border border-line bg-panel2 p-1 text-xs">
          {(["1y", "5y", "all"] as ObjectiveChartRange[]).map((item) => (
            <button
              className={`rounded px-3 py-1 font-semibold ${range === item ? "bg-sky text-slate-950" : "text-slate-300"}`}
              key={item}
              onClick={() => setRange(item)}
              type="button"
            >
              {t(`chart.ranges.${item}`)}
            </button>
          ))}
        </div>
      </div>
      <ObjectiveProjectionLegend showReal={hasRealData} />
      {!hasRealData ? <p className="mb-3 text-xs text-slate-400">{t("chart.realUnavailable")}</p> : null}
      {reachLabel ? (
        <div className="mb-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100">
          {reachLabel}
        </div>
      ) : null}
      <div className="h-80 min-w-0">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="#263844" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" minTickGap={28} stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(value) => money(Number(value), "EUR")} width={82} />
            <Tooltip
              contentStyle={{ background: "#071014", border: "1px solid #263844", borderRadius: 8 }}
              content={<ObjectiveProjectionTooltip />}
            />
            {hasRealData ? (
              <Line
                connectNulls={false}
                dataKey="real"
                dot={false}
                activeDot={{ r: 4 }}
                name={t(projectionSeries.real.labelKey)}
                stroke={projectionSeries.real.color}
                strokeWidth={2}
                type="monotone"
              />
            ) : null}
            <Line dataKey="projected" dot={false} name={t(projectionSeries.projected.labelKey)} stroke={projectionSeries.projected.color} strokeDasharray="6 4" strokeWidth={2} type="monotone" />
            <Line dataKey="objective" dot={false} name={t(projectionSeries.required.labelKey)} stroke={projectionSeries.required.color} strokeDasharray="2 5" strokeWidth={2} type="monotone" />
            <ObjectiveReachMarker label={reachLabel} point={reachPoint} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 flex gap-2 text-xs text-slate-400">
        <Info className="mt-0.5 shrink-0 text-sky" size={14} />
        <span>
          {t("chart.help")}
        </span>
      </p>
    </section>
  );
}
