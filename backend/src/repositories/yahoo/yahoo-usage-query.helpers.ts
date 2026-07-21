import type { YahooUsageCallDto } from "@pea/shared";
import { db } from "../../db.js";
import type { CountRow, YahooUsageStatsQuery } from "./yahoo-usage.repository.js";

export function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function shortError(value?: string) {
  if (!value) return undefined;
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function buildWhere(query: YahooUsageStatsQuery) {
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

export function countRows(sql: string, params: unknown[]) {
  return db.prepare(sql).all(...params) as CountRow[];
}

export function moduleCounts(whereSql: string, params: unknown[]) {
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

export function tickerCounts(whereSql: string, params: unknown[]) {
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

export function timeBucket(period: "hour" | "day") {
  return period === "hour" ? "strftime('%Y-%m-%dT%H:00:00Z', created_at)" : "date(created_at)";
}

export function mapCallRow(row: {
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

