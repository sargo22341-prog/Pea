import type { YahooUsageCallDto, YahooUsageStatsDto } from "@pea/shared";
import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type YahooUsageStatsFilters } from "../../../lib/api";
import { Collapsible, Toast, type SettingsToast } from "../../../components/common/feedback";
import { YahooUsageChart } from "./yahoo-usage/YahooUsageCharts";
import { YahooUsageFilters } from "./yahoo-usage/YahooUsageFilters";
import { YahooUsageSummaryCards } from "./yahoo-usage/YahooUsageSummaryCards";
import { YahooUsageCallsTable, YahooUsageRecentErrors, YahooUsageTopTable } from "./yahoo-usage/YahooUsageTables";
import type { DetailSelection, PeriodKey, SuccessFilter } from "./yahoo-usage/yahooUsageTypes";
import { bucketRange, dateFromPeriod, isoLocalInput } from "./yahoo-usage/yahooUsageUtils";

export function YahooUsageSection({ open, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation(["common"]);
  const [data, setData] = useState<YahooUsageStatsDto | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("24h");
  const [groupBy, setGroupBy] = useState<"hour" | "day">("hour");
  const [method, setMethod] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [ticker, setTicker] = useState("");
  const [source, setSource] = useState("");
  const [success, setSuccess] = useState<SuccessFilter>("all");
  const [customFrom, setCustomFrom] = useState(isoLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [customTo, setCustomTo] = useState(isoLocalInput(new Date()));
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<YahooUsageCallDto[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [selection, setSelection] = useState<DetailSelection>({ label: t("admin.yahooUsage.lastCalls", { ns: "common" }), filters: {} });
  const [toast, setToast] = useState<SettingsToast | null>(null);

  const filters = useMemo<YahooUsageStatsFilters>(() => {
    const from = period === "custom" ? new Date(customFrom) : dateFromPeriod(period);
    const to = period === "custom" ? new Date(customTo) : undefined;
    return {
      dateFrom: from && Number.isFinite(from.getTime()) ? from.toISOString() : undefined,
      dateTo: to && Number.isFinite(to.getTime()) ? to.toISOString() : undefined,
      method: method || undefined,
      module: moduleName.trim() || undefined,
      ticker: ticker.trim() || undefined,
      source: source.trim() || undefined,
      success: success === "all" ? undefined : success === "success",
      groupBy
    };
  }, [customFrom, customTo, groupBy, method, moduleName, period, source, success, ticker]);

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      setData(await api.yahooUsageStats(filters));
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("admin.yahooUsage.statsUnavailable", { ns: "common" }) });
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  const detailFilters = useMemo<YahooUsageStatsFilters>(() => ({ ...filters, ...selection.filters, limit: 10 }), [filters, selection.filters]);

  const loadCalls = useCallback(async () => {
    setCallsLoading(true);
    try {
      setCalls(await api.yahooUsageCalls(detailFilters));
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("admin.yahooUsage.callsUnavailable", { ns: "common" }) });
    } finally {
      setCallsLoading(false);
    }
  }, [detailFilters, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  const chartData = groupBy === "hour" ? data?.callsByHour ?? [] : data?.callsByDay ?? [];

  return (
    <Collapsible onToggle={onToggle} open={open} title={t("admin.yahooUsage.title", { ns: "common" })}>
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <YahooUsageFilters
          customFrom={customFrom}
          customTo={customTo}
          groupBy={groupBy}
          method={method}
          moduleName={moduleName}
          period={period}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
          setGroupBy={setGroupBy}
          setMethod={setMethod}
          setModuleName={setModuleName}
          setPeriod={setPeriod}
          setSource={setSource}
          setSuccess={setSuccess}
          setTicker={setTicker}
          source={source}
          success={success}
          ticker={ticker}
        />
        <button className="btn-ghost shrink-0 gap-2" disabled={loading} onClick={() => void load()} type="button">
          <RefreshCcw size={16} />
          {t("admin.yahooUsage.refresh", { ns: "common" })}
        </button>
      </div>

      {loading && !data ? <p className="muted">{t("admin.yahooUsage.loadingStats", { ns: "common" })}</p> : null}
      {data ? (
        <>
          <YahooUsageSummaryCards data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <YahooUsageChart
              data={chartData}
              onSelect={(bucket) => setSelection({ label: `${groupBy === "hour" ? t("admin.yahooUsage.hour", { ns: "common" }) : t("admin.yahooUsage.day", { ns: "common" })} ${bucket.key}`, filters: bucketRange(bucket, groupBy) })}
              title={groupBy === "hour" ? t("admin.yahooUsage.callsByHour", { ns: "common" }) : t("admin.yahooUsage.callsByDay", { ns: "common" })}
            />
            <YahooUsageChart
              data={data.byMethod}
              onSelect={(bucket) => setSelection({ label: `${t("admin.yahooUsage.type", { ns: "common" })} ${bucket.key}`, filters: { method: bucket.key } })}
              title={t("admin.yahooUsage.byMethod", { ns: "common" })}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            <YahooUsageTopTable emptyLabel={t("admin.yahooUsage.noSource", { ns: "common" })} onSelect={(row) => setSelection({ label: `Source ${row.key}`, filters: { source: row.key } })} rows={data.bySource} title={t("admin.yahooUsage.sources", { ns: "common" })} />
            <YahooUsageTopTable emptyLabel={t("admin.yahooUsage.noTicker", { ns: "common" })} onSelect={(row) => setSelection({ label: `Ticker ${row.key}`, filters: { ticker: row.key } })} rows={data.topTickers} title="Top tickers" />
            <YahooUsageTopTable emptyLabel={t("admin.yahooUsage.noModule", { ns: "common" })} onSelect={(row) => setSelection({ label: `Module ${row.key}`, filters: { module: row.key } })} rows={data.topModules} title="Top modules quoteSummary" />
            <YahooUsageRecentErrors data={data} onSelect={(error) => setSelection({ label: `${t("admin.yahooUsage.error", { ns: "common" })} #${error.id}`, filters: { id: error.id, success: false } })} />
          </div>
          <YahooUsageCallsTable calls={calls} loading={callsLoading} onReset={() => setSelection({ label: t("admin.yahooUsage.lastCalls", { ns: "common" }), filters: {} })} selection={selection.label} />
        </>
      ) : null}
    </Collapsible>
  );
}
