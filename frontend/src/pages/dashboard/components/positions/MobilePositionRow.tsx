import type { PositionRangePerformance } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AssetIcon } from "../../../../components/common/AssetIcon";
import { money, percent } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";
import { MiniSparkline } from "../MiniSparkline";
import { sparklineTone } from "../sparklineTone";
import { Range52Gauge } from "../../../../components/common/metrics/Range52Gauge";
import { formatQuantity, type PositionRowSignals } from "./position-format";
import { YieldOnCostLabel } from "./YieldOnCostLabel";
import { PositionRowBadges } from "./PositionRowBadges";

export function MobilePositionRow({ position, signals, positive, prive, pendingSplit }: {
  position: PositionRangePerformance;
  signals: PositionRowSignals;
  positive: boolean;
  prive: boolean;
  pendingSplit: boolean;
}) {
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_84px_minmax(82px,106px)] items-center gap-2 lg:hidden">
      <AssetIcon symbol={position.symbol} />
      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{position.name}</p>
          <PositionRowBadges compact consensusChange={signals.consensusChange} pendingSplit={pendingSplit} />
        </div>
        <p className="truncate text-[11px] text-slate-400">
          {masquerValeur(`${formatQuantity(position.quantity)} x ${money(position.averageBuyPrice, position.currency)}`, prive)}
          <YieldOnCostLabel prive={prive} value={signals.yieldOnCost} />
        </p>
      </div>
      <MiniSparkline miniChart={position.miniChart} tone={sparklineTone(position)} />
      <div className="min-w-0 text-right leading-tight">
        <p className="truncate whitespace-nowrap text-xs font-semibold tabular-nums">
          {masquerValeur(`${money(position.currentPrice, position.currency)} / ${money(position.currentMarketValue, position.currency)}`, prive)}
        </p>
        <p className={`mt-0.5 flex min-w-0 items-center justify-end gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={12} />
          <span className="min-w-0 truncate">
            {masquerValeur(`${money(position.intervalPerformanceValue, position.currency)} | ${percent(position.intervalPerformancePercent)}`, prive)}
          </span>
        </p>
        <Range52Gauge className="ml-auto mt-1" currency={position.currency} high={signals.fiftyTwoWeekHigh} low={signals.fiftyTwoWeekLow} price={position.currentPrice} />
      </div>
    </div>
  );
}
