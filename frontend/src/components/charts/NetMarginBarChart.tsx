import type { NetMarginItem } from "@pea/shared";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssetIcon } from "../AssetIcon";
import { ChartEmpty } from "./ChartEmpty";
import { formatPercent } from "./chartFormat";

type NetMarginTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: NetMarginItem }>;
};

type MarginAssetTickProps = {
  y?: number;
  payload?: { value?: string };
  data: NetMarginItem[];
  compact: boolean;
};

function NetMarginTooltip({ active, payload }: NetMarginTooltipProps) {
  const item = payload?.[0]?.payload as NetMarginItem | undefined;
  if (!active || !item) return null;

  return (
    <div className="rounded-lg bg-ink/95 p-3 text-sm shadow-glow ring-1 ring-line">
      <div className="flex min-w-0 items-center gap-2">
        <AssetIcon className="h-8 w-8" symbol={item.symbol} />
        <p className="max-w-[240px] truncate font-semibold text-white">{item.name}</p>
      </div>
      <p className="mt-1 text-slate-200">{formatPercent(item.netMargin)}</p>
    </div>
  );
}

function useCompactAxis() {
  const [compact, setCompact] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < 640));

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return compact;
}

function MarginAssetTick({ y, payload, data, compact }: MarginAssetTickProps) {
  const item = data.find((entry: NetMarginItem) => entry.symbol === payload?.value) as NetMarginItem | undefined;
  if (!item || y === undefined) return null;

  return (
    <foreignObject height={38} width={compact ? 46 : 180} x={0} y={Number(y) - 19}>
      <div className="flex h-full min-w-0 items-center gap-2">
        <AssetIcon className="h-8 w-8" symbol={item.symbol} />
        {!compact ? <span className="truncate text-xs font-semibold text-slate-200">{item.name}</span> : null}
      </div>
    </foreignObject>
  );
}

export function NetMarginBarChart({ data }: { data: NetMarginItem[] }) {
  const compactAxis = useCompactAxis();

  if (!data.length) return <ChartEmpty label="Aucune marge nette disponible." />;

  return (
    <div className="h-[420px] min-w-0">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ bottom: 8, left: 0, right: 20, top: 8 }}>
          <CartesianGrid horizontal={false} stroke="#263844" strokeDasharray="3 3" />
          <XAxis tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => formatPercent(Number(value))} type="number" />
          <YAxis
            dataKey="symbol"
            tick={<MarginAssetTick compact={compactAxis} data={data} />}
            tickLine={false}
            type="category"
            width={compactAxis ? 54 : 190}
          />
          <Tooltip content={<NetMarginTooltip />} />
          <Bar dataKey="netMargin" fill="#4ade80" name="Marge nette" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
