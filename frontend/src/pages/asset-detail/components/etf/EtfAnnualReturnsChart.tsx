import type { AssetFundAnnualReturn } from "@pea/shared";
import { memo } from "react";
import { Bar, BarChart, Rectangle, ReferenceLine, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { SafeResponsiveContainer } from "../../../../components/charts/SafeResponsiveContainer";
import { CHART_ANIMATION_MS } from "../../../../components/charts/chartFormat";
import { formatFractionPercent } from "../../../../lib/format-metrics";

const POSITIVE_COLOR = "#4ade80";
const NEGATIVE_COLOR = "#fb7185";

function AnnualReturnTooltip({ active, payload }: { active?: boolean; payload?: { payload?: AssetFundAnnualReturn }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg bg-ink/95 p-2.5 text-xs shadow-glow ring-1 ring-line">
      <p className="font-semibold text-white">{row.year}</p>
      <p className={row.value >= 0 ? "text-mint" : "text-coral"}>{formatFractionPercent(row.value, { signed: true })}</p>
    </div>
  );
}

/** Barre verte pour une année positive, rouge pour une année négative. */
function AnnualReturnBar(props: BarShapeProps) {
  const value = typeof props.value === "number" ? props.value : 0;
  return <Rectangle {...props} fill={value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR} radius={[4, 4, 0, 0]} />;
}

/** Rendement de chaque année civile, en barres vertes ou rouges autour de zéro. */
export const EtfAnnualReturnsChart = memo(function EtfAnnualReturnsChart({ data }: { data: AssetFundAnnualReturn[] }) {
  return (
    <div className="h-56 w-full">
      <SafeResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis axisLine={false} dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} />
          <YAxis axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value: number) => formatFractionPercent(value, { digits: 0 })} tickLine={false} width={48} />
          <ReferenceLine stroke="#475569" y={0} />
          <Tooltip content={<AnnualReturnTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar animationDuration={CHART_ANIMATION_MS} dataKey="value" shape={AnnualReturnBar} />
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
});
