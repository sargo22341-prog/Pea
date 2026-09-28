import type { PositionRangePerformance } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AssetIcon } from "../../../../components/common/AssetIcon";
import { money, percent } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";
import { MiniSparkline } from "../MiniSparkline";
import { sparklineTone } from "../sparklineTone";
import { Range52Gauge } from "../../../../components/common/metrics/Range52Gauge";
import { formatQuantity, type PositionRowSignals } from "./position-format";
import { YieldOnCostLabel } from "./YieldOnCostLabel";
import { PositionRowBadges } from "./PositionRowBadges";

export function DesktopPositionRow({ position, signals, positive, prive, rangeLabel, pendingSplit }: {
  position: PositionRangePerformance;
  signals: PositionRowSignals;
  positive: boolean;
  prive: boolean;
  rangeLabel: string;
  pendingSplit: boolean;
}) {
  const { t } = useTranslation(["dashboard"]);
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="hidden min-w-0 gap-4 lg:grid lg:grid-cols-[minmax(0,1.6fr)_112px_minmax(150px,1fr)] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <AssetIcon symbol={position.symbol} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{position.name}</p>
            <PositionRowBadges consensusChange={signals.consensusChange} incompleteData={position.incompleteData} pendingSplit={pendingSplit} />
          </div>
          <p className="muted truncate">
            {masquerValeur(`${formatQuantity(position.quantity)} x ${money(position.averageBuyPrice, position.currency)}`, prive)}
            <YieldOnCostLabel prive={prive} value={signals.yieldOnCost} />
          </p>
        </div>
      </div>

      <MiniSparkline miniChart={position.miniChart} tone={sparklineTone(position)} />

      <div className="text-right">
        <p className="text-sm text-slate-400">{t("positionRows.valuePerformance", { ns: "dashboard", range: rangeLabel })}</p>
        <p className="font-semibold">
          {masquerValeur(`${money(position.currentPrice, position.currency)} / ${money(position.currentMarketValue, position.currency)}`, prive)}
        </p>
        <Range52Gauge className="ml-auto mt-1" currency={position.currency} high={signals.fiftyTwoWeekHigh} low={signals.fiftyTwoWeekLow} price={position.currentPrice} />
        <p className={`mt-1 flex items-center justify-end gap-1 text-sm font-semibold ${positive ? "text-mint" : "text-coral"}`}>
          <Icon size={16} />
          {masquerValeur(`${money(position.intervalPerformanceValue, position.currency)} | ${percent(position.intervalPerformancePercent)}`, prive)}
        </p>
      </div>
    </div>
  );
}
