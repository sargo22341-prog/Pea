import type { YahooUsageBucketDto, YahooUsageCallDto, YahooUsageRecentErrorDto, YahooUsageStatsDto } from "@pea/shared";
import { AlertTriangle, BarChart3, Clock, Gauge, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { SafeResponsiveContainer } from "../../../components/charts/SafeResponsiveContainer";
import { api, type YahooUsageStatsFilters } from "../../../lib/api";
import { Collapsible, Toast, type SettingsToast } from "../../../components/common/feedback";

type PeriodKey = "today" | "24h" | "7d" | "30d" | "custom";
type SuccessFilter = "all" | "success" | "error";
type DetailSelection = { label: string; filters: YahooUsageStatsFilters };

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

function bucketRange(bucket: YahooUsageBucketDto, groupBy: "hour" | "day"): Pick<YahooUsageStatsFilters, "dateFrom" | "dateTo"> {
  const start = groupBy === "hour" ? new Date(bucket.key) : new Date(`${bucket.key}T00:00:00.000Z`);
  const end = new Date(start);
  if (groupBy === "hour") end.setUTCHours(end.getUTCHours() + 1);
  else end.setUTCDate(end.getUTCDate() + 1);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

function chartBucketPayload(value: unknown): YahooUsageBucketDto {
  const maybePayload = value && typeof value === "object" && "payload" in value ? (value as { payload?: unknown }).payload : value;
  return maybePayload as YahooUsageBucketDto;
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
  const [calls, setCalls] = useState<YahooUsageCallDto[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [selection, setSelection] = useState<DetailSelection>({ label: "10 derniers appels", filters: {} });
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

  const detailFilters = useMemo<YahooUsageStatsFilters>(() => ({ ...filters, ...selection.filters, limit: 10 }), [filters, selection.filters]);

  const loadCalls = useCallback(async () => {
    setCallsLoading(true);
    try {
      setCalls(await api.yahooUsageCalls(detailFilters));
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Liste des appels Yahoo indisponible" });
    } finally {
      setCallsLoading(false);
    }
  }, [detailFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

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
            <UsageChart
              data={chartData}
              onSelect={(bucket) => setSelection({ label: `${groupBy === "hour" ? "Heure" : "Jour"} ${bucket.key}`, filters: bucketRange(bucket, groupBy) })}
              title={groupBy === "hour" ? "Appels par heure" : "Appels par jour"}
            />
            <UsageChart
              data={data.byMethod}
              onSelect={(bucket) => setSelection({ label: `Type ${bucket.key}`, filters: { method: bucket.key } })}
              title="Repartition par type d'appel"
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            <TopTable emptyLabel="Aucune source" onSelect={(row) => setSelection({ label: `Source ${row.key}`, filters: { source: row.key } })} rows={data.bySource} title="Sources internes" />
            <TopTable emptyLabel="Aucun ticker" onSelect={(row) => setSelection({ label: `Ticker ${row.key}`, filters: { ticker: row.key } })} rows={data.topTickers} title="Top tickers" />
            <TopTable emptyLabel="Aucun module" onSelect={(row) => setSelection({ label: `Module ${row.key}`, filters: { module: row.key } })} rows={data.topModules} title="Top modules quoteSummary" />
            <RecentErrors data={data} onSelect={(error) => setSelection({ label: `Erreur #${error.id}`, filters: { id: error.id, success: false } })} />
          </div>
          <CallsTable calls={calls} loading={callsLoading} onReset={() => setSelection({ label: "10 derniers appels", filters: {} })} selection={selection.label} />
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

function UsageChart({ data, onSelect, title }: { data: YahooUsageBucketDto[]; onSelect: (bucket: YahooUsageBucketDto) => void; title: string }) {
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
              <Bar dataKey="calls" fill="#38bdf8" onClick={(bucket) => onSelect(chartBucketPayload(bucket))} radius={[4, 4, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Aucune donnee</div>
        )}
      </div>
    </section>
  );
}

function TopTable({ emptyLabel, onSelect, rows, title }: { emptyLabel: string; onSelect: (row: YahooUsageBucketDto) => void; rows: YahooUsageBucketDto[]; title: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <h3 className="border-b border-line bg-panel2/60 p-3 text-sm font-semibold text-slate-300">{title}</h3>
      {rows.length ? (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-line">
            {rows.slice(0, 10).map((row) => (
              <tr className="cursor-pointer transition hover:bg-sky/5" key={row.key} onClick={() => onSelect(row)}>
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

function RecentErrors({ data, onSelect }: { data: YahooUsageStatsDto; onSelect: (error: YahooUsageRecentErrorDto) => void }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <h3 className="border-b border-line bg-panel2/60 p-3 text-sm font-semibold text-slate-300">Erreurs recentes</h3>
      {data.recentErrors.length ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-line">
              {data.recentErrors.map((error) => (
                <tr key={error.id} className="cursor-pointer align-top transition hover:bg-coral/5" onClick={() => onSelect(error)}>
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

function CallsTable({ calls, loading, onReset, selection }: { calls: YahooUsageCallDto[]; loading: boolean; onReset: () => void; selection: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <div className="flex flex-col gap-2 border-b border-line bg-panel2/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Liste des appels</h3>
          <p className="muted">{selection}</p>
        </div>
        <button className="btn-ghost shrink-0" onClick={onReset} type="button">10 derniers appels</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-panel2/70 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Type</th>
              <th className="p-3">Tickers</th>
              <th className="p-3">Modules</th>
              <th className="p-3">Source</th>
              <th className="p-3">Range</th>
              <th className="p-3">Duree</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Erreur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr><td className="p-3 text-slate-400" colSpan={9}>Chargement des appels...</td></tr>
            ) : calls.length ? calls.map((call) => (
              <tr className="align-top" key={call.id}>
                <td className="whitespace-nowrap p-3 text-slate-300">{formatDateTime(call.createdAt)}</td>
                <td className="p-3 font-medium">{call.method}</td>
                <td className="max-w-56 p-3 text-slate-300">{(call.tickers.length ? call.tickers : call.ticker ? [call.ticker] : []).join(", ") || "-"}</td>
                <td className="max-w-64 p-3 text-slate-300">{call.modules.join(", ") || "-"}</td>
                <td className="max-w-72 p-3 text-slate-300">{call.internalSource ?? "-"}</td>
                <td className="p-3 text-slate-300">{[call.range, call.interval].filter(Boolean).join(" / ") || "-"}</td>
                <td className="whitespace-nowrap p-3 text-slate-300">{formatMs(call.durationMs)}</td>
                <td className={call.success ? "p-3 text-mint" : "p-3 text-coral"}>{call.success ? "Succes" : "Erreur"}</td>
                <td className="max-w-80 p-3 text-slate-300">{call.errorMessage ?? "-"}</td>
              </tr>
            )) : (
              <tr><td className="p-3 text-slate-400" colSpan={9}>Aucun appel pour cette selection.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
