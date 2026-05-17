import type { RuntimeHealthDto, YahooUsageRecentErrorDto } from "@pea/shared";
import { AlertTriangle, CheckCircle2, RefreshCcw, ServerCog } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { Collapsible, Toast } from "../../../components/common/feedback";

const autoRefreshMs = 60_000;

type BadgeTone = "ok" | "warning" | "error" | "neutral";

function formatNumber(value?: number) {
  return new Intl.NumberFormat("fr-FR").format(value ?? 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatDuration(value?: number) {
  if (value === undefined || value === null) return "-";
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${Math.round(value / 100) / 10} s`;
  return `${Math.round(value / 60_000)} min`;
}

function badgeToneClass(tone: BadgeTone) {
  if (tone === "error") return "border-coral/50 bg-coral/10 text-coral";
  if (tone === "warning") return "border-amber-400/50 bg-amber-400/10 text-amber-200";
  if (tone === "ok") return "border-mint/50 bg-mint/10 text-mint";
  return "border-line bg-panel2 text-slate-300";
}

function schedulerTone(status?: RuntimeHealthDto["scheduler"]["status"]): BadgeTone {
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  if (status === "healthy") return "ok";
  return "neutral";
}

function yahooTone(state?: RuntimeHealthDto["yahoo"]["circuitBreaker"]["state"]): BadgeTone {
  if (state === "open") return "error";
  if (state === "half-open") return "warning";
  if (state === "closed") return "ok";
  return "neutral";
}

function failedQueueTone(failed = 0): BadgeTone {
  if (failed > 10) return "error";
  if (failed > 0) return "warning";
  return "ok";
}

function schedulerStatusLabel(status?: RuntimeHealthDto["scheduler"]["status"]) {
  if (status === "healthy") return "sain";
  if (status === "warning") return "attention";
  if (status === "error") return "erreur";
  return "inconnu";
}

function yahooCircuitLabel(state?: RuntimeHealthDto["yahoo"]["circuitBreaker"]["state"]) {
  if (state === "closed") return "fermé";
  if (state === "open") return "ouvert";
  if (state === "half-open") return "semi-ouvert";
  return "inconnu";
}

function queueTypeLabel(type: string) {
  const labels: Record<string, string> = {
    candles: "Bougies",
    snapshots: "Instantanés",
    financials: "Données financières",
    dividends: "Dividendes",
    calendar: "Calendrier",
    cleanup: "Nettoyage"
  };
  return labels[type] ?? type;
}

function warningBadges(data: RuntimeHealthDto | null) {
  if (!data) return [];
  const badges: Array<{ label: string; tone: BadgeTone }> = [];
  if (data.scheduler.status !== "healthy") badges.push({ label: `Planificateur ${schedulerStatusLabel(data.scheduler.status)}`, tone: schedulerTone(data.scheduler.status) });
  if (data.yahoo.circuitBreaker.state !== "closed") badges.push({ label: `Yahoo ${yahooCircuitLabel(data.yahoo.circuitBreaker.state)}`, tone: yahooTone(data.yahoo.circuitBreaker.state) });
  if (data.queue.failed > 0) badges.push({ label: `${formatNumber(data.queue.failed)} taches en erreur`, tone: failedQueueTone(data.queue.failed) });
  if ((data.queue.oldestRunningAgeMs ?? 0) > 30 * 60_000) badges.push({ label: "Exécution > 30 min", tone: "warning" });
  if (data.cache.cacheEntries.expiredRows > 1_000) badges.push({ label: "Cache expiré élevé", tone: "warning" });
  if (data.memory.sseClients >= 80) badges.push({ label: "Clients SSE proches de la limite", tone: "warning" });
  if (data.memory.authFailureEntries > 1_000) badges.push({ label: "Échecs de connexion élevés", tone: "warning" });
  return badges;
}

export function RuntimeHealthSection() {
  const [data, setData] = useState<RuntimeHealthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await api.getRuntimeHealth());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Monitoring runtime indisponible");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), autoRefreshMs);
    return () => window.clearInterval(timer);
  }, []);

  const badges = useMemo(() => warningBadges(data), [data]);

  return (
    <Collapsible title="Monitoring runtime">
      {error ? <Toast tone="error">{error}</Toast> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky/40 bg-sky/10 text-sky">
            <ServerCog size={18} />
          </div>
          <div className="min-w-0">
            <p className="muted">Dernier relevé</p>
            <p className="truncate text-sm font-semibold">{loading && !data ? "Chargement..." : formatDateTime(data?.generatedAt)}</p>
          </div>
        </div>
        <button className="btn-ghost shrink-0 gap-2" disabled={loading || refreshing} onClick={() => void load(true)} type="button">
          <RefreshCcw size={16} />
          Rafraichir
        </button>
      </div>

      {!loading && !data && !error ? <p className="muted">Aucune métrique runtime disponible.</p> : null}
      {data ? (
        <>
          <StatusBadges data={data} warnings={badges} />
          <RuntimeSummary data={data} />
          <CacheBlock data={data} />
          <MemoryBlock data={data} />
          <QueueBlock data={data} />
          <SchedulerBlock data={data} />
          <YahooBlock data={data} />
        </>
      ) : null}
    </Collapsible>
  );
}

function StatusBadges({ data, warnings }: { data: RuntimeHealthDto; warnings: Array<{ label: string; tone: BadgeTone }> }) {
  const items = warnings.length ? warnings : [{ label: "Aucune alerte active", tone: "ok" as BadgeTone }];
  return (
    <div className="flex flex-wrap gap-2">
      <Badge label={`Planificateur ${schedulerStatusLabel(data.scheduler.status)}`} tone={schedulerTone(data.scheduler.status)} />
      <Badge label={`Yahoo ${yahooCircuitLabel(data.yahoo.circuitBreaker.state)}`} tone={yahooTone(data.yahoo.circuitBreaker.state)} />
      <Badge label={`File en erreur ${formatNumber(data.queue.failed)}`} tone={failedQueueTone(data.queue.failed)} />
      {items.map((item) => <Badge key={item.label} label={item.label} tone={item.tone} />)}
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "neutral" ? ServerCog : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${badgeToneClass(tone)}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

function RuntimeSummary({ data }: { data: RuntimeHealthDto }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <MetricTile label="Planificateur" value={schedulerStatusLabel(data.scheduler.status)} tone={schedulerTone(data.scheduler.status)} />
      <MetricTile label="Circuit Yahoo" value={yahooCircuitLabel(data.yahoo.circuitBreaker.state)} tone={yahooTone(data.yahoo.circuitBreaker.state)} />
      <MetricTile label="File de tâches" value={`${formatNumber(data.queue.pending)} / ${formatNumber(data.queue.running)} / ${formatNumber(data.queue.failed)}`} hint="en attente / en cours / en erreur" />
      <MetricTile label="Dernière purge cache" value={formatDateTime(data.cache.cleanup.lastRunAt)} hint={`${formatNumber(data.cache.cleanup.totalDeletedRows)} lignes`} />
    </div>
  );
}

function MetricTile({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: BadgeTone }) {
  return (
    <div className={`min-w-0 rounded-md border p-3 ${tone === "neutral" ? "border-line bg-panel2/60" : badgeToneClass(tone)}`}>
      <p className="muted">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function CacheBlock({ data }: { data: RuntimeHealthDto }) {
  return (
    <RuntimeBlock title="Cache">
      <div className="grid gap-3 md:grid-cols-5">
        <MetricTile label="cache_entries" value={formatNumber(data.cache.cacheEntries.totalRows)} />
        <MetricTile label="Expirées" value={formatNumber(data.cache.cacheEntries.expiredRows)} tone={data.cache.cacheEntries.expiredRows > 1_000 ? "warning" : "neutral"} />
        <MetricTile label="portfolio_chart_cache" value={formatNumber(data.cache.derivedCaches.portfolioChartCacheRows)} />
        <MetricTile label="positions_perf_cache" value={formatNumber(data.cache.derivedCaches.portfolioPositionsPerformanceCacheRows)} />
        <MetricTile label="frontend_block_cache" value={formatNumber(data.cache.derivedCaches.frontendBlockCacheRows)} />
      </div>
      <CompactTable
        columns={["Périmètre", "Lignes", "Expirées"]}
        emptyLabel="Aucun scope cache."
        rows={data.cache.cacheEntries.byScope.map((row) => [row.scope, formatNumber(row.rows), formatNumber(row.expiredRows)])}
      />
    </RuntimeBlock>
  );
}

function MemoryBlock({ data }: { data: RuntimeHealthDto }) {
  const memory = data.memory;
  return (
    <RuntimeBlock title="Mémoire">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Cache graphiques intraday" value={formatNumber(memory.intradayChartCacheEntries)} />
        <MetricTile label="Cache cotations instantanées" value={formatNumber(memory.snapshotQuoteCacheEntries)} />
        <MetricTile label="Jours ouverts en cache" value={formatNumber(memory.previousOpenMarketDaysCacheEntries)} />
        <MetricTile label="Requêtes backend en cours" value={formatNumber(memory.backendInFlightRequests)} />
        <MetricTile label="Clients SSE" value={formatNumber(memory.sseClients)} tone={memory.sseClients >= 80 ? "warning" : "neutral"} />
        <MetricTile label="Seaux rate-limit" value={formatNumber(memory.rateLimitBuckets)} />
        <MetricTile label="Échecs de connexion" value={formatNumber(memory.authFailureEntries)} tone={memory.authFailureEntries > 1_000 ? "warning" : "neutral"} />
        <MetricTile label="Mémoire Yahoo" value={`${formatNumber(memory.yahooSearchCacheEntries)} / ${formatNumber(memory.yahooQuoteCombineCacheEntries)}`} hint="recherche / cotations combinées" />
      </div>
    </RuntimeBlock>
  );
}

function QueueBlock({ data }: { data: RuntimeHealthDto }) {
  return (
    <RuntimeBlock title="File de tâches">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="En attente" value={formatNumber(data.queue.pending)} />
        <MetricTile label="En cours" value={formatNumber(data.queue.running)} />
        <MetricTile label="En erreur" value={formatNumber(data.queue.failed)} tone={failedQueueTone(data.queue.failed)} />
        <MetricTile label="Terminées" value={formatNumber(data.queue.completed)} />
        <MetricTile label="Plus ancienne attente" value={formatDuration(data.queue.oldestPendingAgeMs)} />
        <MetricTile label="Plus ancienne exécution" value={formatDuration(data.queue.oldestRunningAgeMs)} tone={(data.queue.oldestRunningAgeMs ?? 0) > 30 * 60_000 ? "warning" : "neutral"} />
        <MetricTile label="Workers" value={`${formatNumber(data.queue.activeWorkers)} / ${formatNumber(data.queue.maxConcurrentTasks)}`} />
        <MetricTile label="Symboles occupés" value={formatNumber(data.queue.busySymbols)} />
      </div>
      <CompactTable
        columns={["Type", "Priorité", "En attente", "En cours", "En erreur", "Terminées"]}
        emptyLabel="Aucune tâche historisée."
        rows={data.queue.byTypePriority.map((row) => [
          queueTypeLabel(row.type),
          formatNumber(row.priority),
          formatNumber(row.pending),
          formatNumber(row.running),
          formatNumber(row.failed),
          formatNumber(row.completed)
        ])}
      />
    </RuntimeBlock>
  );
}

function SchedulerBlock({ data }: { data: RuntimeHealthDto }) {
  return (
    <RuntimeBlock title="Planificateur">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Dernier tick" value={formatDateTime(data.scheduler.lastTickAt)} />
        <MetricTile label="Durée tick" value={formatDuration(data.scheduler.lastTickDurationMs)} />
        <MetricTile label="Dernier succès" value={formatDateTime(data.scheduler.lastSuccessAt)} />
        <MetricTile label="Dernière erreur" value={data.scheduler.lastError || "-"} tone={data.scheduler.lastError ? "error" : "neutral"} />
        <MetricTile label="Propriétaire du verrou" value={data.scheduler.lockOwner || "-"} />
        <MetricTile label="Âge du heartbeat" value={formatDuration(data.scheduler.heartbeatAgeMs)} />
        <MetricTile label="Marchés suivis" value={formatNumber(data.scheduler.trackedMarkets)} />
        <MetricTile label="Prochain tick" value={formatDateTime(data.scheduler.nextTickAt)} />
      </div>
    </RuntimeBlock>
  );
}

function YahooBlock({ data }: { data: RuntimeHealthDto }) {
  const breaker = data.yahoo.circuitBreaker;
  return (
    <RuntimeBlock title="Yahoo">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="Circuit breaker" value={yahooCircuitLabel(breaker.state)} tone={yahooTone(breaker.state)} />
        <MetricTile label="Échecs consécutifs" value={formatNumber(breaker.failureCount)} />
        <MetricTile label="Ouvert à" value={formatDateTime(breaker.openedAt)} />
        <MetricTile label="Appels 24h" value={formatNumber(data.yahoo.recentCalls24h)} />
        <MetricTile label="Requêtes en cours" value={formatNumber(data.yahoo.backendInFlightRequests)} />
        <MetricTile label="Cache recherche" value={formatNumber(data.yahoo.searchCacheEntries)} />
        <MetricTile label="Cache cotations combinées" value={formatNumber(data.yahoo.quoteCombineCacheEntries)} />
      </div>
      <RecentErrors errors={data.yahoo.recentErrors} />
    </RuntimeBlock>
  );
}

function RecentErrors({ errors }: { errors: YahooUsageRecentErrorDto[] }) {
  return (
    <CompactTable
      columns={["Date", "Méthode", "Ticker", "Erreur"]}
      emptyLabel="Aucune erreur Yahoo récente."
      rows={errors.slice(0, 5).map((error) => [
        formatDateTime(error.createdAt),
        error.method,
        error.ticker ?? (error.tickers.join(", ") || "-"),
        error.errorMessage ?? "-"
      ])}
    />
  );
}

function RuntimeBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border border-line bg-panel2/30 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function CompactTable({ columns, rows, emptyLabel }: { columns: string[]; rows: string[][]; emptyLabel: string }) {
  if (!rows.length) return <p className="muted">{emptyLabel}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-panel2/80 text-xs uppercase text-slate-400">
          <tr>
            {columns.map((column) => <th key={column} className="p-2">{column}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) => <td key={`${cell}-${index}`} className="p-2 text-slate-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
