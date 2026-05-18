import type { AssetDetails, Quote } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, BadgeEuro, BarChart3, CalendarDays, CircleDollarSign, Database, Gauge, Landmark, Percent, Timer, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatChange, formatMaybeDate, formatMaybeInteger, formatMaybeMoney, formatMaybePercentYield, money } from "../../../lib/format";
import { type InfoTone, toneFromNumber } from "../../../utils/assetTone";
import { AssetInfoTile } from "./AssetInfoTile";

export function AssetMarketInfo({
  marketInfo,
  quote,
  currency,
  hasKnownDividends
}: {
  marketInfo?: AssetDetails["marketInfo"];
  quote: Quote;
  currency: string;
  hasKnownDividends: boolean;
}) {
  const { t } = useTranslation(["asset"]);
  const info = marketInfo ?? {};
  const displayCurrency = info.currency ?? currency;
  const dayChange = info.regularMarketChange ?? quote.change;
  const dayChangePercent = info.regularMarketChangePercent ?? quote.changePercent;
  const dayTone = toneFromNumber(dayChange);
  const DayTrendIcon = dayTone === "negative" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-white/[0.05] bg-slate-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] xl:grid-cols-3">
      <AssetInfoTile icon={<Gauge size={18} />} iconTone="amber" label={t("market.state", { ns: "asset" })} tone={marketStateTone(info.marketState ?? quote.marketState)} value={info.marketState ?? quote.marketState ?? "n/a"} variant="market" />
      <AssetInfoTile icon={<BadgeEuro size={18} />} iconTone="green" label={t("market.lastPrice", { ns: "asset" })} value={formatMaybeMoney(info.regularMarketPrice ?? quote.price, displayCurrency)} variant="market" />
      <AssetInfoTile icon={<DayTrendIcon size={18} />} iconTone={dayTone === "negative" ? "red" : "green"} label={t("market.dayChange", { ns: "asset" })} tone={dayTone} value={formatChange(dayChange, dayChangePercent, displayCurrency)} variant="market" />
      <AssetInfoTile icon={<Landmark size={18} />} iconTone="slate" label={t("market.exchange", { ns: "asset" })} value={info.exchangeName ?? quote.exchange ?? "n/a"} variant="market" />
      <AssetInfoTile icon={<CircleDollarSign size={18} />} iconTone="cyan" label={t("market.currency", { ns: "asset" })} value={info.currency ?? quote.currency ?? "n/a"} variant="market" />
      <AssetInfoTile icon={<BarChart3 size={18} />} iconTone="sky" label={t("market.volume", { ns: "asset" })} value={formatMaybeInteger(info.regularMarketVolume)} variant="market" />
      <div className="col-span-2 xl:col-span-2">
        <AssetInfoTile
          icon={<Timer size={18} />}
          iconTone="slate"
          label={t("market.range52Weeks", { ns: "asset" })}
          value={
            <Range52Slider
              currency={displayCurrency}
              currentPrice={info.regularMarketPrice ?? quote.price}
              high52={info.fiftyTwoWeekHigh}
              low52={info.fiftyTwoWeekLow}
            />
          }
          variant="market"
        />
      </div>
      <AssetInfoTile icon={<Database size={18} />} iconTone="sky" label={t("market.averageVolume3m", { ns: "asset" })} value={formatMaybeInteger(info.averageDailyVolume3Month)} variant="market" />

      {hasKnownDividends && (
        <>
          <AssetInfoTile icon={<Wallet size={18} />} iconTone="green" label={t("market.annualDividend", { ns: "asset" })} value={formatMaybeMoney(info.dividendRate ?? quote.dividendRate, displayCurrency)} variant="market" />
          <AssetInfoTile icon={<Percent size={18} />} iconTone="green" label={t("market.dividendYield", { ns: "asset" })} tone={info.dividendYield == null && quote.dividendYield == null ? "muted" : undefined} value={formatMaybePercentYield(info.dividendYield ?? quote.dividendYield)} variant="market" />
          <AssetInfoTile icon={<CalendarDays size={18} />} iconTone="slate" label={t("market.exDate", { ns: "asset" })} value={formatMaybeDate(info.exDividendDate)} variant="market" />
        </>
      )}
    </div>
  );
}

function Range52Slider({
  low52,
  high52,
  currentPrice,
  currency
}: {
  low52?: number;
  high52?: number;
  currentPrice?: number;
  currency: string;
}) {
  const { t } = useTranslation(["asset"]);

  if (
    low52 == null ||
    high52 == null ||
    currentPrice == null ||
    !Number.isFinite(low52) ||
    !Number.isFinite(high52) ||
    !Number.isFinite(currentPrice) ||
    high52 <= low52
  ) {
    return <span className="text-slate-500">n/a</span>;
  }

  const ratio = Math.max(0, Math.min(1, (currentPrice - low52) / (high52 - low52)));
  const percentPosition = ratio * 100;
  const rangeTone = percentPosition > 70 ? "green" : percentPosition < 30 ? "red" : "amber";
  const progressClass =
    rangeTone === "green"
      ? "bg-mint shadow-[0_0_14px_rgba(74,222,128,0.2)]"
      : rangeTone === "red"
        ? "bg-coral shadow-[0_0_14px_rgba(251,113,133,0.2)]"
        : "bg-amber shadow-[0_0_14px_rgba(251,191,36,0.18)]";
  const thumbClass =
    rangeTone === "green"
      ? "bg-mint shadow-[0_0_16px_rgba(74,222,128,0.5)]"
      : rangeTone === "red"
        ? "bg-coral shadow-[0_0_16px_rgba(251,113,133,0.48)]"
        : "bg-amber shadow-[0_0_16px_rgba(251,191,36,0.42)]";

  return (
    <div className="min-w-0 pt-1">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-slate-400">
        <span>{money(low52, currency)}</span>
        <span className="text-right">{money(high52, currency)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-950/80 shadow-[inset_0_1px_4px_rgba(0,0,0,0.55)]">
        <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${percentPosition}%` }} />
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 ${thumbClass}`}
          style={{ left: `${percentPosition}%` }}
        />
      </div>
      <div className="mt-2 text-xs font-medium text-slate-400">
        {t("market.currentPrice", { ns: "asset" })} <span className="text-slate-200">{money(currentPrice, currency)}</span>
      </div>
    </div>
  );
}

function marketStateTone(value?: string): InfoTone {
  if (!value) return "muted";
  return value.toUpperCase() === "REGULAR" ? "positive" : "warning";
}
