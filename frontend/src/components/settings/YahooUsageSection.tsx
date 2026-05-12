import type { YahooUsageBucketDto, YahooUsageStatsDto } from "@pea/shared";
import { AlertTriangle, BarChart3, Clock, Gauge, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "../charts/SafeResponsiveContainer";
import { api, type YahooUsageStatsFilters } from "../../lib/api";
import { Collapsible, Toast, type SettingsToast } from "./SettingsSection";

type PeriodKey = "today" | "24h" | "7d" | "30d" | "custom";
type SuccessFilter = "all" | "success" | "error";

const methods = ["quote", "quoteSummary", "chart", "search", "historical", "options", "screener", "fundamentalsTimeSeries"];

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoLocalInput(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function dateFromPeriod(period: PeriodKey) {
  const now = new Date();
  if (period === "today") return startOfToday();
  if (period === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, style: "percent" }).format(value);
}

function formatMs(value: number) {
  return `${formatNumber(Math.round(value))} ms`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" }).format(date);
}

export function YahooUsageSection() {
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
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Statistiques Yahoo indisponibles" });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = groupBy === "hour" ? data?.callsByHour ?? [] : data?.callsByDay ?? [];

  return (
    <Collapsible title="Utilisation Yahoo Finance">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Filters
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
          Actualiser
        </button>
      </div>

      {loading && !data ? <p className="muted">Chargement des statistiques Yahoo...</p> : null}
      {data ? (
        <>
          <SummaryCards data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <UsageChart data={chartData} title={groupBy === "hour" ? "Appels par heure" : "Appels par jour"} />
            <UsageChart data={data.byMethod} title="Repartition par type d'appel" />
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            <TopTable emptyLabel="Aucune source" rows={data.bySource} title="Sources internes" />
            <TopTable emptyLabel="Aucun ticker" rows={data.topTickers} title="Top tickers" />
            <TopTable emptyLabel="Aucun module" rows={data.topModules} title="Top modules quoteSummary" />
            <RecentErrors data={data} />
          </div>
        </>
      ) : null}
    </Collapsible>
  );
}

function Filters(props: {
  customFrom: string;
  customTo: string;
  groupBy: "hour" | "day";
  method: string;
  moduleName: string;
  period: PeriodKey;
  source: string;
  success: SuccessFilter;
  ticker: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  setGroupBy: (value: "hour" | "day") => void;
  setMethod: (value: string) => void;
  setModuleName: (value: string) => void;
  setPeriod: (value: PeriodKey) => void;
  setSource: (value: string) => void;
  setSuccess: (value: SuccessFilter) => void;
  setTicker: (value: string) => void;
}) {
  return (
    <div className="grid flex-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
      <label className="space-y-1 text-sm">
        <span className="muted">Periode</span>
        <select className="input" value={props.period} onChange={(event) => props.setPeriod(event.target.value as PeriodKey)}>
          <option value="today">Aujourd'hui</option>
          <option value="24h">24h</option>
          <option value="7d">7 jours</option>
          <option value="30d">30 jours</option>
          <option value="custom">Personnalise</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Type</span>
        <select className="input" value={props.method} onChange={(event) => props.setMethod(event.target.value)}>
          <option value="">Tous</option>
          {methods.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Module</span>
        <input className="input" onChange={(event) => props.setModuleName(event.target.value)} placeholder="price" value={props.moduleName} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Ticker</span>
        <input className="input uppercase" onChange={(event) => props.setTicker(event.target.value)} placeholder="AIR.PA" value={props.ticker} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Source</span>
        <input className="input" onChange={(event) => props.setSource(event.target.value)} placeholder="navigation ou tache" value={props.source} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Statut</span>
        <select className="input" value={props.success} onChange={(event) => props.setSuccess(event.target.value as SuccessFilter)}>
          <option value="all">Tous</option>
          <option value="success">Succes</option>
          <option value="error">Erreur</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Groupement</span>
        <select className="input" value={props.groupBy} onChange={(event) => props.setGroupBy(event.target.value as "hour" | "day")}>
          <option value="hour">Heure</option>
          <option value="day">Jour</option>
        </select>
      </label>
      {props.period === "custom" && (
        <>
          <label className="space-y-1 text-sm">
            <span className="muted">Debut</span>
            <input className="input" onChange={(event) => props.setCustomFrom(event.target.value)} type="datetime-local" value={props.customFrom} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="muted">Fin</span>
            <input className="input" onChange={(event) => props.setCustomTo(event.target.value)} type="datetime-local" value={props.customTo} />
          </label>
        </>
      )}
    </div>
  );
}

function SummaryCards({ data }: { data: YahooUsageStatsDto }) {
  const cards = [
    { label: "Appels aujourd'hui", value: formatNumber(data.summary.callsToday), icon: BarChart3 },
    { label: "Appels 24h", value: formatNumber(data.summary.calls24h), icon: Clock },
    { label: "Appels 7 jours", value: formatNumber(data.summary.calls7d), icon: BarChart3 },
    { label: "Taux d'erreur", value: formatPercent(data.summary.errorRate), icon: AlertTriangle },
    { label: "Duree moyenne", value: formatMs(data.summary.avgDurationMs), icon: Gauge }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(({ icon: Icon, label, value }) => (
        <div className="min-w-0 rounded-md border border-line bg-panel2/60 p-3" key={label}>
          <div className="flex items-center gap-2 text-slate-400">
            <Icon size={16} />
            <p className="muted">{label}</p>
          </div>
          <p className="mt-2 truncate text-lg font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function UsageChart({ data, title }: { data: YahooUsageBucketDto[]; title: string }) {
  return (
    <section className="rounded-md border border-line bg-panel2/40 p-3">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="h-64">
        {data.length ? (
          <SafeResponsiveContainer>
            <BarChart data={data} margin={{ bottom: 8, left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis dataKey="key" minTickGap={24} stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#071014", border: "1px solid #1f2937", borderRadius: 6 }} />
              <Bar dataKey="calls" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Aucune donnee</div>
        )}
      </div>
    </section>
  );
}

function TopTable({ emptyLabel, rows, title }: { emptyLabel: string; rows: YahooUsageBucketDto[]; title: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <h3 className="border-b border-line bg-panel2/60 p-3 text-sm font-semibold text-slate-300">{title}</h3>
      {rows.length ? (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-line">
            {rows.slice(0, 10).map((row) => (
              <tr key={row.key}>
                <td className="p-3 font-medium">{row.key}</td>
                <td className="p-3 text-right text-slate-300">{formatNumber(row.calls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="p-3 text-sm text-slate-400">{emptyLabel}</p>
      )}
    </section>
  );
}

function RecentErrors({ data }: { data: YahooUsageStatsDto }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <h3 className="border-b border-line bg-panel2/60 p-3 text-sm font-semibold text-slate-300">Erreurs recentes</h3>
      {data.recentErrors.length ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-line">
              {data.recentErrors.map((error) => (
                <tr key={error.id} className="align-top">
                  <td className="p-3">
                    <p className="font-medium">{error.method} {error.ticker ?? error.tickers[0] ?? ""}</p>
                    <p className="muted">{formatDateTime(error.createdAt)} - {formatMs(error.durationMs)}</p>
                    <p className="mt-1 text-slate-300">{error.errorMessage ?? "Erreur Yahoo"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-3 text-sm text-slate-400">Aucune erreur sur la periode.</p>
      )}
    </section>
  );
}
