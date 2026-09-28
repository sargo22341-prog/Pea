import type { FinancialStatementRow } from "@pea/shared";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, ComposedChart, Legend, Line, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { SafeResponsiveContainer } from "../../../../../components/charts/SafeResponsiveContainer";
import { CHART_ANIMATION_MS } from "../../../../../components/charts/chartFormat";
import { formatCompactMoney } from "../../../../../lib/format-metrics";
import type { StatementSeries } from "./statements-series";

/** Opacité d'une barre « 12 mois glissants », distinguée des exercices clos. */
const TTM_OPACITY = 0.45;

interface ChartRow extends FinancialStatementRow {
  label: string;
}

/** Barre d'une série ; celle de la ligne « 12 mois glissants » est estompée et pointillée. */
function statementBar(props: BarShapeProps, color: string, rows: ChartRow[]) {
  const ttm = rows[props.index]?.isTtm === true;
  return <Rectangle {...props} fill={color} fillOpacity={ttm ? TTM_OPACITY : 1} radius={[3, 3, 0, 0]} stroke={ttm ? color : "none"} strokeDasharray={ttm ? "4 3" : undefined} />;
}

/** Bilan ou flux de trésorerie par période ; la ligne TTM est tracée en pointillé. */
export const StatementsChart = memo(function StatementsChart({ rows, series, currency }: { rows: ChartRow[]; series: StatementSeries[]; currency: string }) {
  const { t } = useTranslation("asset");

  return (
    <div className="h-64 w-full">
      <SafeResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis axisLine={false} dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} />
          <YAxis axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value: number) => formatCompactMoney(value, currency)} tickLine={false} width={72} />
          <ReferenceLine stroke="#475569" y={0} />
          <Tooltip
            contentStyle={{ background: "rgba(7, 16, 20, 0.9)", border: "0", borderRadius: 8 }}
            formatter={(value, name) => [typeof value === "number" ? formatCompactMoney(value, currency) : String(value), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((item) =>
            item.kind === "bar" ? (
              <Bar animationDuration={CHART_ANIMATION_MS} dataKey={item.key} fill={item.color} key={item.key} name={t(`statements.metrics.${item.key}`)} shape={(props: BarShapeProps) => statementBar(props, item.color, rows)} />
            ) : (
              <Line animationDuration={CHART_ANIMATION_MS} dataKey={item.key} dot key={item.key} name={t(`statements.metrics.${item.key}`)} stroke={item.color} strokeWidth={2} type="monotone" />
            )
          )}
        </ComposedChart>
      </SafeResponsiveContainer>
    </div>
  );
});
