import type { AllocationChartItem } from "@pea/shared";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AssetIcon } from "../common/AssetIcon";
import { ChartEmpty } from "./ChartEmpty";
import { chartColors, formatPercent } from "./chartFormat";
import { useResponsivePieTooltip } from "./chartInteraction";

type SectorTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: AllocationChartItem }>;
};

function SectorTooltip({ active, payload }: SectorTooltipProps) {
  const item = payload?.[0]?.payload as AllocationChartItem | undefined;
  if (!active || !item) return null;

  return (
    <div className="max-w-[260px] rounded-lg bg-ink/95 p-3 text-sm shadow-glow ring-1 ring-line">
      <p className="font-semibold text-white">{item.name}</p>
      <p className="text-slate-300">{formatPercent(item.percentage)} du portefeuille</p>
      <div className="mt-2 grid gap-1.5">
        {item.symbols.slice(0, 8).map((asset) => (
          <span className="flex min-w-0 items-center gap-2 rounded-md bg-panel2 px-2 py-1 text-xs text-slate-200" key={asset.symbol}>
            <AssetIcon className="h-7 w-7" symbol={asset.symbol} />
            <span className="truncate">{asset.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SectorAllocationChart({ data }: { data: AllocationChartItem[] }) {
  const { containerRef, onPointerDownCapture, tooltipResetKey, tooltipTrigger } = useResponsivePieTooltip();

  if (!data.length) return <ChartEmpty />;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]" ref={containerRef} onPointerDownCapture={onPointerDownCapture}>
      <div className="h-80 min-w-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="56%" nameKey="name" outerRadius="86%" paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell fill={chartColors[index % chartColors.length]} key={entry.name} />
              ))}
            </Pie>
            <Tooltip content={<SectorTooltip />} key={tooltipResetKey} trigger={tooltipTrigger} wrapperStyle={{ outline: "none" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid content-center gap-2">
        {data.map((item, index) => (
          <div className="flex min-w-0 items-center justify-between gap-3 text-sm" key={item.name}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="truncate text-slate-200">{item.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-white">{formatPercent(item.percentage)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
