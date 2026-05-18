import type { AssetChartDto, MarketSessionDto, RangeKey } from "@pea/shared";
import { GitCompare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ComparisonChart, PriceHistoryChart } from "../../../components/charts/PriceHistoryChart";
import { RangeSelector } from "../../../components/common/RangeSelector";
import { formatMarketSessionHours } from "../../../lib/timezone";

type ChartPoint = { date: string; value: number | null };

export function AssetHistorySection({
  chart,
  chartPendingOpenConfirmation,
  chartPoints,
  chartRefreshing,
  compareTargetsCount,
  comparisonError,
  comparisonSeries,
  displayChart,
  loading,
  marketSession,
  onCompare,
  onRangeChange,
  preparingSymbols,
  quoteCurrency,
  range,
  stale,
  symbol,
  userTimezone
}: {
  chart?: AssetChartDto;
  chartPendingOpenConfirmation: boolean;
  chartPoints: ChartPoint[];
  chartRefreshing: boolean;
  compareTargetsCount: number;
  comparisonError?: string | null;
  comparisonSeries: Parameters<typeof ComparisonChart>[0]["comparisonSeries"];
  displayChart?: AssetChartDto;
  loading: boolean;
  marketSession?: MarketSessionDto | null;
  onCompare: () => void;
  onRangeChange: (range: RangeKey) => void;
  preparingSymbols: string[];
  quoteCurrency: string;
  range: RangeKey;
  stale?: boolean;
  symbol: string;
  userTimezone: string;
}) {
  const { t } = useTranslation(["asset", "portfolio"]);
  const chartMarketSession = marketSession ?? displayChart?.marketSession;

  return (
    <section className={`card p-0 sm:p-4 ${chartRefreshing ? "stale-refreshing" : ""}`}>
      <div className="mb-3 flex flex-col justify-between gap-4 px-2 sm:mb-4 sm:flex-row sm:items-center sm:px-0">
        <h2 className="font-semibold">{t("asset:history")}</h2>
        <div className="flex items-center justify-end gap-2">
          <button className={compareTargetsCount > 0 ? "btn bg-blue-600 text-white" : "btn-ghost"} onClick={onCompare} type="button">
            <GitCompare size={17} />
            {compareTargetsCount > 0 ? compareTargetsCount : t("portfolio:compare.title")}
          </button>
          <RangeSelector onChange={onRangeChange} value={range} />
        </div>
      </div>
      {loading && chartPoints.length <= 1 ? (
        <div className="flex h-80 items-center justify-center text-sm text-slate-400">{t("asset:chartLoading")}</div>
      ) : chartPoints.length > 1 ? (
        comparisonSeries.length > 0 ? (
          <ComparisonChart
            comparisonSeries={comparisonSeries}
            data={chartPoints}
            heightClassName="h-80"
            mainSymbol={symbol}
            marketSession={chartMarketSession}
            range={range}
            userTimezone={userTimezone}
          />
        ) : (
          <PriceHistoryChart
            baselineDatetime={displayChart?.baselineDatetime}
            baselinePrice={displayChart?.baselinePrice}
            currency={quoteCurrency}
            data={chartPoints}
            heightClassName="h-80"
            hideXAxisTicks
            marketSession={chartMarketSession}
            range={range}
            userTimezone={userTimezone}
          />
        )
      ) : chart?.isPreparing ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink text-sm text-amber">
          {t("asset:dataPreparing")}
        </div>
      ) : chartPendingOpenConfirmation ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink px-4 text-center text-sm text-slate-400">
          {t("asset:intradayPendingOpen")}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink text-sm text-slate-400">
          {range === "1d" ? t("asset:intradayUnavailableShort") : t("asset:marketUnavailable")}
        </div>
      )}
      {range === "1d" && (chartPoints.length === 0 || stale) && (
        <p className="mt-3 text-xs text-slate-500">{t("asset:intradayUnavailable")}</p>
      )}
      {compareTargetsCount > 0 && preparingSymbols.length > 0 && (
        <p className="mt-3 text-xs text-amber">
          {t("asset:comparisonPreparing", { symbols: preparingSymbols.join(", ") })}
        </p>
      )}
      {compareTargetsCount > 0 && comparisonError && preparingSymbols.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">{comparisonError}</p>
      )}
      {range === "1d" && marketSession && (marketSession.timezone !== userTimezone || marketSession.sessions.length > 1) && (
        <p className="mt-3 text-xs text-slate-400">
          {t("asset:marketHours", { city: marketSession.city, hours: formatMarketSessionHours(marketSession.sessions) })}
        </p>
      )}
    </section>
  );
}
