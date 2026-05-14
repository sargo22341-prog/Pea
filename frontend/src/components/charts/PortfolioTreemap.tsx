import type { PortfolioTreemapItem } from "@pea/shared";
import { memo } from "react";
import { Tooltip, Treemap } from "recharts";
import { AssetIcon } from "../common/AssetIcon";
import { ChartEmpty } from "./ChartEmpty";
import { chartColors, formatPercent } from "./chartFormat";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";

type TreemapContentProps = Partial<PortfolioTreemapItem> & {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
};

type TreemapTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: PortfolioTreemapItem }>;
};

function TreemapContent(props: TreemapContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, symbol, percentage, logoUrl } = props;
  const showDetails = width > 82 && height > 46;
  const showLogo = logoUrl && width > 120 && height > 74;

  return (
    <g>
      <rect fill={chartColors[index % chartColors.length]} height={height} rx={6} ry={6} stroke="#071014" strokeWidth={3} width={width} x={x} y={y} />
      {showDetails ? (
        <>
          {showLogo ? <image height={28} href={logoUrl} width={28} x={x + 10} y={y + 10} /> : null}
          <text fill="#071014" fontSize={13} fontWeight={800} x={x + 10} y={y + (showLogo ? 54 : 22)}>
            {symbol ?? ""}
          </text>
          <text fill="#071014" fontSize={12} fontWeight={700} opacity={0.82} x={x + 10} y={y + (showLogo ? 72 : 40)}>
            {formatPercent(percentage ?? 0)}
          </text>
        </>
      ) : null}
    </g>
  );
}

function TreemapTooltip({ active, payload }: TreemapTooltipProps) {
  const item = payload?.[0]?.payload as PortfolioTreemapItem | undefined;
  if (!active || !item) return null;

  return (
    <div className="rounded-lg bg-ink/95 p-3 text-sm shadow-glow ring-1 ring-line">
      <div className="flex min-w-0 items-center gap-2">
        <AssetIcon className="h-8 w-8" symbol={item.symbol} />
        <p className="max-w-[240px] truncate font-semibold text-white">{item.name}</p>
      </div>
      <p className="mt-1 text-slate-200">{formatPercent(item.percentage)} du portefeuille</p>
      <p className="mt-1 text-xs text-slate-400">{item.country ?? "N/A"} · {item.sector ?? "N/A"}</p>
    </div>
  );
}

export const PortfolioTreemap = memo(function PortfolioTreemap({ data }: { data: PortfolioTreemapItem[] }) {
  if (!data.length) return <ChartEmpty />;
  const treemapData = data as unknown as Array<Record<string, unknown>>;

  return (
    <div className="h-[420px] min-w-0">
      <SafeResponsiveContainer>
        <Treemap content={<TreemapContent />} data={treemapData} dataKey="value" isAnimationActive={false} nameKey="symbol" stroke="#071014">
          <Tooltip content={<TreemapTooltip />} />
        </Treemap>
      </SafeResponsiveContainer>
    </div>
  );
});
