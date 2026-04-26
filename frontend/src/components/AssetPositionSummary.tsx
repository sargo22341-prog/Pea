import type { PositionWithMarket, RangeKey } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Coins } from "lucide-react";
import { formatNumber, formatRangeLabel, formatSignedMoney, money, percent } from "../lib/format";
import { toneClass, toneFromNumber } from "../utils/assetTone";
import { AssetInfoTile } from "./AssetInfoTile";

export function AssetPositionSummary({
  position,
  currentPrice,
  firstPriceOfRange,
  range
}: {
  position: PositionWithMarket;
  currentPrice: number;
  firstPriceOfRange?: number;
  range: RangeKey;
}) {
  const safeCurrentPrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : position.currentPrice;
  const currentValue = position.quantity * safeCurrentPrice;
  const totalPerformanceValue = currentValue - position.costBasis;
  const totalPerformancePercent = position.costBasis ? (totalPerformanceValue / position.costBasis) * 100 : undefined;
  const periodPerformanceValue = firstPriceOfRange && firstPriceOfRange > 0 ? position.quantity * (safeCurrentPrice - firstPriceOfRange) : undefined;
  const periodPerformancePercent = firstPriceOfRange && firstPriceOfRange > 0 ? ((safeCurrentPrice - firstPriceOfRange) / firstPriceOfRange) * 100 : undefined;
  const valueRatio = Math.max(0, Math.min(100, position.costBasis > 0 ? (currentValue / Math.max(position.costBasis, currentValue)) * 100 : 0));
  const totalTone = toneFromNumber(totalPerformanceValue);
  const periodTone = toneFromNumber(periodPerformanceValue);
  const totalIsNegative = totalTone === "negative";
  const TotalTrendIcon = totalIsNegative ? ArrowDownRight : ArrowUpRight;
  const PeriodTrendIcon = periodTone === "negative" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="space-y-4">
      <div
        className={`relative overflow-hidden rounded-[18px] border border-white/[0.06] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] ${
          totalIsNegative
            ? "bg-[linear-gradient(135deg,rgba(251,113,133,0.16),rgba(0,0,0,0)),linear-gradient(135deg,rgba(7,16,20,0.96),rgba(35,13,20,0.9))]"
            : "bg-[linear-gradient(135deg,rgba(0,255,150,0.12),rgba(0,0,0,0)),linear-gradient(135deg,rgba(7,16,20,0.96),rgba(13,31,35,0.9))]"
        }`}
      >
        <div
          className={`absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full border ${
            totalIsNegative
              ? "border-coral/25 bg-coral/10 text-coral shadow-[0_0_24px_rgba(251,113,133,0.24)]"
              : "border-mint/25 bg-mint/10 text-mint shadow-[0_0_24px_rgba(74,222,128,0.22)]"
          }`}
        >
          <TotalTrendIcon size={24} />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Valeur actuelle</p>
        <div className="mt-3 pr-14">
          <p className="text-[32px] font-bold leading-tight text-white sm:text-4xl">{money(currentValue, position.currency)}</p>
          <p className={`mt-2 text-base font-semibold ${toneClass(totalTone)}`}>
            {formatSignedMoney(totalPerformanceValue, position.currency)}
            <span className="ml-2 text-sm">{totalPerformancePercent == null ? "(n/a)" : `(${percent(totalPerformancePercent)})`}</span>
          </p>
        </div>
        <div className="mt-6 border-t border-white/[0.05] pt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>
              Valeur d'achat <span className="ml-1 text-slate-300">{money(position.costBasis, position.currency)}</span>
            </span>
            <span className="text-right">
              Valeur actuelle <span className="ml-1 text-slate-300">{money(currentValue, position.currency)}</span>
            </span>
          </div>
          <div className="relative mt-3 h-3 rounded-full bg-slate-950/80 shadow-[inset_0_1px_4px_rgba(0,0,0,0.55)]">
            <div
              className={`h-full rounded-full ${totalTone === "negative" ? "bg-gradient-to-r from-coral to-red-400" : "bg-gradient-to-r from-emerald-500 via-mint to-teal-300"} shadow-[0_0_18px_rgba(74,222,128,0.26)]`}
              style={{ width: `${valueRatio}%` }}
            />
            <div
              className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-slate-950 ${totalTone === "negative" ? "bg-coral shadow-[0_0_18px_rgba(251,113,133,0.48)]" : "bg-mint shadow-[0_0_18px_rgba(74,222,128,0.55)]"}`}
              style={{ left: `calc(${valueRatio}% - 0.5rem)` }}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AssetInfoTile icon={<Coins size={18} />} iconTone="sky" label="Quantité" value={formatNumber(position.quantity)} />
        <AssetInfoTile icon={<CircleDollarSign size={18} />} iconTone="cyan" label="Prix moyen" value={money(position.averageBuyPrice, position.currency)} />
        <AssetInfoTile
          icon={<PeriodTrendIcon size={18} />}
          iconTone={periodTone === "negative" ? "red" : "green"}
          label={`Performance ${formatRangeLabel(range, { compact: true })}`}
          tone={periodTone}
          value={
            periodPerformanceValue == null || periodPerformancePercent == null ? (
              <span className="text-slate-500">n/a</span>
            ) : (
              <>
                <span>{formatSignedMoney(periodPerformanceValue, position.currency)}</span>
                <span className="ml-1">({percent(periodPerformancePercent)})</span>
              </>
            )
          }
        />
      </div>
    </div>
  );
}
