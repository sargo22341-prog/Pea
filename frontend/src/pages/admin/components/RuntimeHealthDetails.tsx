import type { RuntimeHealthDto, YahooUsageRecentErrorDto } from "@pea/shared";
import { AlertTriangle, CheckCircle2, ServerCog } from "lucide-react";
import type { ReactNode } from "react";
import { badgeToneClass, failedQueueTone, formatDateTime, formatDuration, formatNumber, queueTypeLabel, schedulerStatusLabel, schedulerTone, yahooCircuitLabel, yahooTone, type BadgeTone, type RuntimeT } from "./runtime-health-format";

export function RuntimeHealthDetails({ data, warnings, t }: { data: RuntimeHealthDto; warnings: Array<{ label: string; tone: BadgeTone }>; t: RuntimeT }) {
  return (
    <>
      <StatusBadges data={data} t={t} warnings={warnings} />
      <RuntimeSummary data={data} t={t} />
      <CacheBlock data={data} t={t} />
      <MemoryBlock data={data} t={t} />
      <QueueBlock data={data} t={t} />
      <SchedulerBlock data={data} t={t} />
      <YahooBlock data={data} t={t} />
    </>
  );
}

function StatusBadges({ data, warnings, t }: { data: RuntimeHealthDto; warnings: Array<{ label: string; tone: BadgeTone }>; t: RuntimeT }) {
  const items = warnings.length ? warnings : [{ label: t("admin.runtime.noActiveAlert", { ns: "common" }), tone: "ok" as BadgeTone }];
  return (
    <div className="flex flex-wrap gap-2">
      <Badge label={t("admin.runtime.schedulerWarning", { ns: "common", status: schedulerStatusLabel(t, data.scheduler.status) })} tone={schedulerTone(data.scheduler.status)} />
      <Badge label={t("admin.runtime.yahooWarning", { ns: "common", status: yahooCircuitLabel(t, data.yahoo.circuitBreaker.state) })} tone={yahooTone(data.yahoo.circuitBreaker.state)} />
      <Badge label={t("admin.runtime.queueFailed", { count: data.queue.failed, ns: "common" })} tone={failedQueueTone(data.queue.failed)} />
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

function RuntimeSummary({ data, t }: { data: RuntimeHealthDto; t: RuntimeT }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <MetricTile label={t("admin.runtime.scheduler", { ns: "common" })} value={schedulerStatusLabel(t, data.scheduler.status)} tone={schedulerTone(data.scheduler.status)} />
      <MetricTile label={t("admin.runtime.yahooCircuit", { ns: "common" })} value={yahooCircuitLabel(t, data.yahoo.circuitBreaker.state)} tone={yahooTone(data.yahoo.circuitBreaker.state)} />
      <MetricTile label={t("admin.runtime.queue", { ns: "common" })} value={`${formatNumber(data.queue.pending)} / ${formatNumber(data.queue.running)} / ${formatNumber(data.queue.failed)}`} hint={t("admin.runtime.pendingRunningFailed", { ns: "common" })} />
      <MetricTile label={t("admin.runtime.lastCacheCleanup", { ns: "common" })} value={formatDateTime(data.cache.cleanup.lastRunAt)} hint={t("admin.runtime.rows", { count: data.cache.cleanup.totalDeletedRows, ns: "common" })} />
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

function CacheBlock({ data, t }: { data: RuntimeHealthDto; t: RuntimeT }) {
  return (
    <RuntimeBlock title="Cache">
      <div className="grid gap-3 md:grid-cols-5">
        <MetricTile label="cache_entries" value={formatNumber(data.cache.cacheEntries.totalRows)} />
        <MetricTile label={t("admin.runtime.expired", { ns: "common" })} value={formatNumber(data.cache.cacheEntries.expiredRows)} tone={data.cache.cacheEntries.expiredRows > 1_000 ? "warning" : "neutral"} />
        <MetricTile label="portfolio_chart_cache" value={formatNumber(data.cache.derivedCaches.portfolioChartCacheRows)} />
        <MetricTile label="positions_perf_cache" value={formatNumber(data.cache.derivedCaches.portfolioPositionsPerformanceCacheRows)} />
        <MetricTile label="frontend_block_cache" value={formatNumber(data.cache.derivedCaches.frontendBlockCacheRows)} />
      </div>
      <CompactTable
        columns={[t("admin.runtime.scope", { ns: "common" }), t("admin.runtime.lines", { ns: "common" }), t("admin.runtime.expired", { ns: "common" })]}
        emptyLabel={t("admin.runtime.noCacheScope", { ns: "common" })}
        rows={data.cache.cacheEntries.byScope.map((row) => [row.scope, formatNumber(row.rows), formatNumber(row.expiredRows)])}
      />
    </RuntimeBlock>
  );
}

function MemoryBlock({ data, t }: { data: RuntimeHealthDto; t: RuntimeT }) {
  const memory = data.memory;
  return (
    <RuntimeBlock title={t("admin.runtime.memory", { ns: "common" })}>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label={t("admin.runtime.intradayChartCache", { ns: "common" })} value={formatNumber(memory.intradayChartCacheEntries)} />
        <MetricTile label={t("admin.runtime.snapshotQuoteCache", { ns: "common" })} value={formatNumber(memory.snapshotQuoteCacheEntries)} />
        <MetricTile label={t("admin.runtime.openDaysCache", { ns: "common" })} value={formatNumber(memory.previousOpenMarketDaysCacheEntries)} />
        <MetricTile label={t("admin.runtime.backendRequests", { ns: "common" })} value={formatNumber(memory.backendInFlightRequests)} />
        <MetricTile label={t("admin.runtime.sseClients", { ns: "common" })} value={formatNumber(memory.sseClients)} tone={memory.sseClients >= 80 ? "warning" : "neutral"} />
        <MetricTile label={t("admin.runtime.rateLimitBuckets", { ns: "common" })} value={formatNumber(memory.rateLimitBuckets)} />
        <MetricTile label={t("admin.runtime.authFailures", { ns: "common" })} value={formatNumber(memory.authFailureEntries)} tone={memory.authFailureEntries > 1_000 ? "warning" : "neutral"} />
        <MetricTile label={t("admin.runtime.yahooMemory", { ns: "common" })} value={`${formatNumber(memory.yahooSearchCacheEntries)} / ${formatNumber(memory.yahooQuoteCombineCacheEntries)}`} hint={t("admin.runtime.searchCombinedQuotes", { ns: "common" })} />
      </div>
    </RuntimeBlock>
  );
}

function QueueBlock({ data, t }: { data: RuntimeHealthDto; t: RuntimeT }) {
  return (
    <RuntimeBlock title={t("admin.runtime.queue", { ns: "common" })}>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label={t("admin.runtime.pending", { ns: "common" })} value={formatNumber(data.queue.pending)} />
        <MetricTile label={t("admin.runtime.running", { ns: "common" })} value={formatNumber(data.queue.running)} />
        <MetricTile label={t("admin.runtime.failed", { ns: "common" })} value={formatNumber(data.queue.failed)} tone={failedQueueTone(data.queue.failed)} />
        <MetricTile label={t("admin.runtime.completed", { ns: "common" })} value={formatNumber(data.queue.completed)} />
        <MetricTile label={t("admin.runtime.oldestPending", { ns: "common" })} value={formatDuration(data.queue.oldestPendingAgeMs)} />
        <MetricTile label={t("admin.runtime.oldestRunning", { ns: "common" })} value={formatDuration(data.queue.oldestRunningAgeMs)} tone={(data.queue.oldestRunningAgeMs ?? 0) > 30 * 60_000 ? "warning" : "neutral"} />
        <MetricTile label={t("admin.runtime.workers", { ns: "common" })} value={`${formatNumber(data.queue.activeWorkers)} / ${formatNumber(data.queue.maxConcurrentTasks)}`} />
        <MetricTile label={t("admin.runtime.busySymbols", { ns: "common" })} value={formatNumber(data.queue.busySymbols)} />
      </div>
      <CompactTable
        columns={[t("admin.yahooUsage.type", { ns: "common" }), t("admin.runtime.priority", { ns: "common" }), t("admin.runtime.pending", { ns: "common" }), t("admin.runtime.running", { ns: "common" }), t("admin.runtime.failed", { ns: "common" }), t("admin.runtime.completed", { ns: "common" })]}
        emptyLabel={t("admin.runtime.noHistoricalTask", { ns: "common" })}
        rows={data.queue.byTypePriority.map((row) => [
          queueTypeLabel(t, row.type),
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

function SchedulerBlock({ data, t }: { data: RuntimeHealthDto; t: RuntimeT }) {
  return (
    <RuntimeBlock title={t("admin.runtime.scheduler", { ns: "common" })}>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label={t("admin.runtime.lastTick", { ns: "common" })} value={formatDateTime(data.scheduler.lastTickAt)} />
        <MetricTile label={t("admin.runtime.tickDuration", { ns: "common" })} value={formatDuration(data.scheduler.lastTickDurationMs)} />
        <MetricTile label={t("admin.runtime.lastSuccess", { ns: "common" })} value={formatDateTime(data.scheduler.lastSuccessAt)} />
        <MetricTile label={t("admin.runtime.lastError", { ns: "common" })} value={data.scheduler.lastError || "-"} tone={data.scheduler.lastError ? "error" : "neutral"} />
        <MetricTile label={t("admin.runtime.lockOwner", { ns: "common" })} value={data.scheduler.lockOwner || "-"} />
        <MetricTile label={t("admin.runtime.heartbeatAge", { ns: "common" })} value={formatDuration(data.scheduler.heartbeatAgeMs)} />
        <MetricTile label={t("admin.runtime.trackedMarkets", { ns: "common" })} value={formatNumber(data.scheduler.trackedMarkets)} />
        <MetricTile label={t("admin.runtime.nextTick", { ns: "common" })} value={formatDateTime(data.scheduler.nextTickAt)} />
      </div>
    </RuntimeBlock>
  );
}

function YahooBlock({ data, t }: { data: RuntimeHealthDto; t: RuntimeT }) {
  const breaker = data.yahoo.circuitBreaker;
  return (
    <RuntimeBlock title="Yahoo">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label={t("admin.runtime.circuitBreaker", { ns: "common" })} value={yahooCircuitLabel(t, breaker.state)} tone={yahooTone(breaker.state)} />
        <MetricTile label={t("admin.runtime.consecutiveFailures", { ns: "common" })} value={formatNumber(breaker.failureCount)} />
        <MetricTile label={t("admin.runtime.openedAt", { ns: "common" })} value={formatDateTime(breaker.openedAt)} />
        <MetricTile label={t("admin.runtime.calls24h", { ns: "common" })} value={formatNumber(data.yahoo.recentCalls24h)} />
        <MetricTile label={t("admin.runtime.backendRequests", { ns: "common" })} value={formatNumber(data.yahoo.backendInFlightRequests)} />
        <MetricTile label={t("admin.runtime.searchCache", { ns: "common" })} value={formatNumber(data.yahoo.searchCacheEntries)} />
        <MetricTile label={t("admin.runtime.combinedQuoteCache", { ns: "common" })} value={formatNumber(data.yahoo.quoteCombineCacheEntries)} />
      </div>
      <RecentErrors errors={data.yahoo.recentErrors} t={t} />
    </RuntimeBlock>
  );
}

function RecentErrors({ errors, t }: { errors: YahooUsageRecentErrorDto[]; t: RuntimeT }) {
  return (
    <CompactTable
      columns={[t("fields.date", { ns: "common" }), t("admin.runtime.method", { ns: "common" }), t("admin.runtime.ticker", { ns: "common" }), t("admin.runtime.error", { ns: "common" })]}
      emptyLabel={t("admin.runtime.noRecentYahooError", { ns: "common" })}
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
