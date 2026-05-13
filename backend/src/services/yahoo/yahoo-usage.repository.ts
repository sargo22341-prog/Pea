import type { YahooUsageCallDto, YahooUsageStatsDto } from "@pea/shared";
import { db } from "../../db.js";
import { logger } from "../shared/logger.service.js";

export interface YahooUsageLogInput {
  method: string;
  modules?: string[];
  ticker?: string;
  tickers?: string[];
  tickerCount?: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  internalSource?: string;
  range?: string;
  interval?: string;
  cacheHit?: boolean;
  requestKey?: string;
}

export interface YahooUsageStatsQuery {
  id?: number;
  dateFrom?: string;
  dateTo?: string;
  method?: string;
  module?: string;
  ticker?: string;
  source?: string;
  success?: boolean;
  groupBy?: "hour" | "day" | "method" | "module" | "ticker";
  limit?: number;
}

type CountRow = { key: string | null; calls: number; errors?: number; avgDurationMs?: number | null };

const retentionDays = 90;
let writesSinceCleanup = 0;

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function shortError(value?: string) {
  if (!value) return undefined;
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildWhere(query: YahooUsageStatsQuery) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.dateFrom) {
    clauses.push("created_at >= ?");
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push("created_at <= ?");
    params.push(query.dateTo);
  }
  if (query.id !== undefined) {
    clauses.push("id = ?");
    params.push(query.id);
  }
  if (query.method) {
    clauses.push("method = ?");
    params.push(query.method);
  }
  if (query.module) {
    clauses.push("modules_json LIKE ?");
    params.push(`%"${query.module}"%`);
  }
  if (query.ticker) {
    const ticker = normalizeSymbol(query.ticker);
    clauses.push("(ticker = ? OR tickers_json LIKE ?)");
    params.push(ticker, `%"${ticker}"%`);
  }
  if (query.source) {
    clauses.push("internal_source LIKE ?");
    params.push(`%${query.source}%`);
  }
  if (query.success !== undefined) {
    clauses.push("success = ?");
    params.push(query.success ? 1 : 0);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function countRows(sql: string, params: unknown[]) {
  return db.prepare(sql).all(...params) as CountRow[];
}

function moduleCounts(whereSql: string, params: unknown[]) {
  const rows = db.prepare(`SELECT modules_json FROM yahoo_usage_logs ${whereSql}`).all(...params) as Array<{ modules_json?: string | null }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const moduleName of parseJsonArray(row.modules_json)) {
      counts.set(moduleName, (counts.get(moduleName) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, calls]) => ({ key, calls }))
    .sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key))
    .slice(0, 20);
}

function tickerCounts(whereSql: string, params: unknown[]) {
  const rows = db.prepare(`SELECT ticker, tickers_json FROM yahoo_usage_logs ${whereSql}`).all(...params) as Array<{ ticker?: string | null; tickers_json?: string | null }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const tickers = parseJsonArray(row.tickers_json);
    if (!tickers.length && row.ticker) tickers.push(String(row.ticker));
    for (const ticker of tickers) {
      counts.set(ticker, (counts.get(ticker) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, calls]) => ({ key, calls }))
    .sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key))
    .slice(0, 20);
}

function timeBucket(period: "hour" | "day") {
  return period === "hour" ? "strftime('%Y-%m-%dT%H:00:00Z', created_at)" : "date(created_at)";
}

function mapCallRow(row: {
  id: number;
  created_at: string;
  method: string;
  ticker?: string | null;
  tickers_json?: string | null;
  ticker_count: number;
  modules_json?: string | null;
  success: number;
  error_message?: string | null;
  internal_source?: string | null;
  duration_ms: number;
  range?: string | null;
  interval?: string | null;
  cache_hit: number;
  request_key?: string | null;
}): YahooUsageCallDto {
  return {
    id: row.id,
    createdAt: row.created_at,
    method: row.method,
    ticker: row.ticker ?? undefined,
    tickers: parseJsonArray(row.tickers_json),
    tickerCount: Number(row.ticker_count ?? 0),
    modules: parseJsonArray(row.modules_json),
    success: Boolean(row.success),
    errorMessage: row.error_message ?? undefined,
    internalSource: row.internal_source ?? undefined,
    durationMs: Number(row.duration_ms),
    range: row.range ?? undefined,
    interval: row.interval ?? undefined,
    cacheHit: Boolean(row.cache_hit),
    requestKey: row.request_key ?? undefined
  };
}

export const yahooUsageRepository = {
  record(input: YahooUsageLogInput) {
    try {
      const tickers = input.tickers?.map(normalizeSymbol).filter(Boolean) ?? (input.ticker ? [normalizeSymbol(input.ticker)] : []);
      const uniqueTickers = [...new Set(tickers)];
      const modules = input.modules?.map((item) => item.trim()).filter(Boolean) ?? [];
      db.prepare(
        `INSERT INTO yahoo_usage_logs
          (created_at, method, modules_json, ticker, tickers_json, ticker_count, duration_ms, success, error_message, internal_source, range, interval, cache_hit, request_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        new Date().toISOString(),
        input.method,
        modules.length ? JSON.stringify([...new Set(modules)]) : null,
        input.ticker ? normalizeSymbol(input.ticker) : uniqueTickers[0] ?? null,
        uniqueTickers.length ? JSON.stringify(uniqueTickers) : null,
        input.tickerCount ?? uniqueTickers.length,
        Math.max(0, Math.round(input.durationMs)),
        input.success ? 1 : 0,
        shortError(input.errorMessage) ?? null,
        input.internalSource ?? null,
        input.range ?? null,
        input.interval ?? null,
        input.cacheHit ? 1 : 0,
        input.requestKey ?? null
      );

      writesSinceCleanup += 1;
      if (writesSinceCleanup >= 100) {
        writesSinceCleanup = 0;
        this.cleanupRetention();
      }
    } catch (error) {
      logger.warn("market-data", "Yahoo usage tracking failed", { error: error instanceof Error ? error.message : String(error) });
    }
  },

  cleanupRetention(days = retentionDays) {
    try {
      db.prepare("DELETE FROM yahoo_usage_logs WHERE julianday(created_at) < julianday('now', ?)").run(`-${days} days`);
    } catch (error) {
      logger.warn("market-data", "Yahoo usage retention cleanup failed", { error: error instanceof Error ? error.message : String(error) });
    }
  },

  list(query: YahooUsageStatsQuery): YahooUsageCallDto[] {
    const { sql: whereSql, params } = buildWhere(query);
    const limit = Math.min(Math.max(Math.round(Number(query.limit ?? 10)), 1), 100);
    const rows = db
      .prepare(
        `SELECT id, created_at, method, ticker, tickers_json, ticker_count, modules_json, success, error_message,
                internal_source, duration_ms, range, interval, cache_hit, request_key
         FROM yahoo_usage_logs ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .all(...params, limit) as Parameters<typeof mapCallRow>[0][];
    return rows.map(mapCallRow);
  },

  stats(query: YahooUsageStatsQuery): YahooUsageStatsDto {
    const { sql: whereSql, params } = buildWhere(query);
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS totalCalls,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errorCalls,
                AVG(duration_ms) AS avgDurationMs
         FROM yahoo_usage_logs ${whereSql}`
      )
      .get(...params) as { totalCalls: number; errorCalls?: number | null; avgDurationMs?: number | null };

    const today = db
      .prepare("SELECT COUNT(*) AS calls FROM yahoo_usage_logs WHERE date(created_at) = date('now')")
      .get() as { calls: number };
    const last24h = db
      .prepare("SELECT COUNT(*) AS calls FROM yahoo_usage_logs WHERE julianday(created_at) >= julianday('now', '-24 hours')")
      .get() as { calls: number };
    const last7d = db
      .prepare("SELECT COUNT(*) AS calls FROM yahoo_usage_logs WHERE julianday(created_at) >= julianday('now', '-7 days')")
      .get() as { calls: number };

    const callsByHour = countRows(
      `SELECT ${timeBucket("hour")} AS key, COUNT(*) AS calls, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors, AVG(duration_ms) AS avgDurationMs
       FROM yahoo_usage_logs ${whereSql}
       GROUP BY key ORDER BY key ASC`,
      params
    );
    const callsByDay = countRows(
      `SELECT ${timeBucket("day")} AS key, COUNT(*) AS calls, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors, AVG(duration_ms) AS avgDurationMs
       FROM yahoo_usage_logs ${whereSql}
       GROUP BY key ORDER BY key ASC`,
      params
    );
    const byMethod = countRows(
      `SELECT method AS key, COUNT(*) AS calls, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors, AVG(duration_ms) AS avgDurationMs
       FROM yahoo_usage_logs ${whereSql}
       GROUP BY method ORDER BY calls DESC, method ASC`,
      params
    );
    const bySource = countRows(
      `SELECT COALESCE(internal_source, 'backend') AS key, COUNT(*) AS calls, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors, AVG(duration_ms) AS avgDurationMs
       FROM yahoo_usage_logs ${whereSql}
       GROUP BY COALESCE(internal_source, 'backend') ORDER BY calls DESC, key ASC LIMIT 30`,
      params
    );

    const recentErrors = db
      .prepare(
        `SELECT id, created_at, method, ticker, tickers_json, modules_json, error_message, internal_source, duration_ms
         FROM yahoo_usage_logs ${whereSql ? `${whereSql} AND` : "WHERE"} success = 0
         ORDER BY created_at DESC LIMIT 20`
      )
      .all(...params) as Array<{
        id: number;
        created_at: string;
        method: string;
        ticker?: string | null;
        tickers_json?: string | null;
        modules_json?: string | null;
        error_message?: string | null;
        internal_source?: string | null;
        duration_ms: number;
      }>;

    const errorCalls = Number(totals.errorCalls ?? 0);
    const totalCalls = Number(totals.totalCalls ?? 0);
    return {
      summary: {
        totalCalls,
        callsToday: Number(today.calls ?? 0),
        calls24h: Number(last24h.calls ?? 0),
        calls7d: Number(last7d.calls ?? 0),
        errorCalls,
        errorRate: totalCalls ? errorCalls / totalCalls : 0,
        avgDurationMs: Math.round(Number(totals.avgDurationMs ?? 0))
      },
      callsByHour: callsByHour.map((row) => ({ key: String(row.key), calls: Number(row.calls), errors: Number(row.errors ?? 0), avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)) })),
      callsByDay: callsByDay.map((row) => ({ key: String(row.key), calls: Number(row.calls), errors: Number(row.errors ?? 0), avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)) })),
      byMethod: byMethod.map((row) => ({ key: String(row.key), calls: Number(row.calls), errors: Number(row.errors ?? 0), avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)) })),
      bySource: bySource.map((row) => ({ key: String(row.key), calls: Number(row.calls), errors: Number(row.errors ?? 0), avgDurationMs: Math.round(Number(row.avgDurationMs ?? 0)) })),
      topTickers: tickerCounts(whereSql, params),
      topModules: moduleCounts(whereSql, params),
      recentErrors: recentErrors.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        method: row.method,
        ticker: row.ticker ?? undefined,
        tickers: parseJsonArray(row.tickers_json),
        modules: parseJsonArray(row.modules_json),
        errorMessage: row.error_message ?? undefined,
        internalSource: row.internal_source ?? undefined,
        durationMs: Number(row.duration_ms)
      }))
    };
  }
};
