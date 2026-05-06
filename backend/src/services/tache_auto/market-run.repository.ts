import { db } from "../../db.js";
import { nowIso } from "./market-task.utils.js";

export type OpenRunStatus =
  | "pending"
  | "checking"
  | "confirmed_open"
  | "confirmed_open_partial"
  | "holiday_suspected"
  | "missed_open_window"
  | "failed"
  | "skipped_weekend"
  | "skipped_no_assets";

export type CloseRunStatus =
  | "pending"
  | "checking"
  | "confirmed_closed"
  | "confirmed_closed_partial"
  | "close_not_confirmed"
  | "failed"
  | "skipped_weekend"
  | "skipped_no_assets";

export interface MarketDailyRunRow {
  id: number;
  market_key: string;
  trading_date: string;
  timezone: string;
  open_expected_at?: string | null;
  open_status: OpenRunStatus;
  open_confirmed_at?: string | null;
  open_attempts: number;
  open_last_error?: string | null;
  open_last_checked_at?: string | null;
  next_open_check_at?: string | null;
  open_status_message?: string | null;
  open_job_id?: string | null;
  close_expected_at?: string | null;
  close_status: CloseRunStatus;
  close_confirmed_at?: string | null;
  close_attempts: number;
  close_last_error?: string | null;
  close_last_checked_at?: string | null;
  next_close_check_at?: string | null;
  close_status_message?: string | null;
  close_job_id?: string | null;
  assets_count: number;
  created_at: string;
  updated_at: string;
}

export class MarketRunRepository {
  ensure(input: {
    marketKey: string;
    tradingDate: string;
    timezone: string;
    assetsCount: number;
    openExpectedAt?: Date;
    closeExpectedAt?: Date;
    skippedWeekend?: boolean;
    skippedNoAssets?: boolean;
  }): MarketDailyRunRow {
    const timestamp = nowIso();
    const openStatus = input.skippedWeekend ? "skipped_weekend" : input.skippedNoAssets ? "skipped_no_assets" : "pending";
    const closeStatus = input.skippedWeekend ? "skipped_weekend" : input.skippedNoAssets ? "skipped_no_assets" : "pending";
    db.prepare(
      `INSERT INTO market_daily_runs (
        market_key, trading_date, timezone, open_expected_at, open_status, close_expected_at, close_status,
        assets_count, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_key, trading_date) DO UPDATE SET
         timezone = excluded.timezone,
         open_expected_at = excluded.open_expected_at,
         close_expected_at = excluded.close_expected_at,
         open_status = CASE
           WHEN excluded.assets_count = 0 AND market_daily_runs.open_status NOT IN ('confirmed_open', 'confirmed_open_partial', 'holiday_suspected', 'missed_open_window', 'skipped_weekend') THEN 'skipped_no_assets'
           WHEN excluded.assets_count > 0 AND market_daily_runs.open_status = 'skipped_no_assets' THEN 'pending'
           ELSE market_daily_runs.open_status
         END,
         close_status = CASE
           WHEN excluded.assets_count = 0 AND market_daily_runs.close_status NOT IN ('confirmed_closed', 'confirmed_closed_partial', 'close_not_confirmed', 'skipped_weekend') THEN 'skipped_no_assets'
           WHEN excluded.assets_count > 0 AND market_daily_runs.close_status = 'skipped_no_assets' THEN 'pending'
           ELSE market_daily_runs.close_status
         END,
         assets_count = excluded.assets_count,
         updated_at = excluded.updated_at`
    ).run(
      input.marketKey,
      input.tradingDate,
      input.timezone,
      input.openExpectedAt?.toISOString() ?? null,
      openStatus,
      input.closeExpectedAt?.toISOString() ?? null,
      closeStatus,
      input.assetsCount,
      timestamp,
      timestamp
    );
    return this.get(input.marketKey, input.tradingDate)!;
  }

  get(marketKey: string, tradingDate: string): MarketDailyRunRow | undefined {
    return db.prepare("SELECT * FROM market_daily_runs WHERE market_key = ? AND trading_date = ?").get(marketKey, tradingDate) as
      | MarketDailyRunRow
      | undefined;
  }

  listLatest(): MarketDailyRunRow[] {
    return db
      .prepare(
        `SELECT r.*
         FROM market_daily_runs r
         JOIN (
           SELECT market_key, MAX(trading_date) AS trading_date
           FROM market_daily_runs
           GROUP BY market_key
         ) latest ON latest.market_key = r.market_key AND latest.trading_date = r.trading_date
         ORDER BY r.market_key ASC`
      )
      .all() as MarketDailyRunRow[];
  }

  updateOpen(
    id: number,
    patch: Partial<Pick<MarketDailyRunRow, "open_status" | "open_confirmed_at" | "open_last_error" | "open_last_checked_at" | "next_open_check_at" | "open_status_message">> & {
      incrementAttempts?: boolean;
    }
  ) {
    const row = this.byId(id);
    if (!row) return;
    const value = <K extends keyof typeof patch, F extends keyof MarketDailyRunRow>(patchKey: K, rowKey: F) =>
      Object.prototype.hasOwnProperty.call(patch, patchKey) ? patch[patchKey] : row[rowKey] ?? null;
    db.prepare(
      `UPDATE market_daily_runs SET
        open_status = ?,
        open_confirmed_at = ?,
        open_attempts = ?,
        open_last_error = ?,
        open_last_checked_at = ?,
        next_open_check_at = ?,
        open_status_message = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      value("open_status", "open_status"),
      value("open_confirmed_at", "open_confirmed_at"),
      patch.incrementAttempts ? row.open_attempts + 1 : row.open_attempts,
      value("open_last_error", "open_last_error"),
      value("open_last_checked_at", "open_last_checked_at"),
      value("next_open_check_at", "next_open_check_at"),
      value("open_status_message", "open_status_message"),
      nowIso(),
      id
    );
  }

  updateClose(
    id: number,
    patch: Partial<
      Pick<
        MarketDailyRunRow,
        "close_status" | "close_confirmed_at" | "close_last_error" | "close_last_checked_at" | "next_close_check_at" | "close_status_message" | "close_job_id"
      >
    > & {
      incrementAttempts?: boolean;
    }
  ) {
    const row = this.byId(id);
    if (!row) return;
    const value = <K extends keyof typeof patch, F extends keyof MarketDailyRunRow>(patchKey: K, rowKey: F) =>
      Object.prototype.hasOwnProperty.call(patch, patchKey) ? patch[patchKey] : row[rowKey] ?? null;
    db.prepare(
      `UPDATE market_daily_runs SET
        close_status = ?,
        close_confirmed_at = ?,
        close_attempts = ?,
        close_last_error = ?,
        close_last_checked_at = ?,
        next_close_check_at = ?,
        close_status_message = ?,
        close_job_id = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      value("close_status", "close_status"),
      value("close_confirmed_at", "close_confirmed_at"),
      patch.incrementAttempts ? row.close_attempts + 1 : row.close_attempts,
      value("close_last_error", "close_last_error"),
      value("close_last_checked_at", "close_last_checked_at"),
      value("next_close_check_at", "next_close_check_at"),
      value("close_status_message", "close_status_message"),
      value("close_job_id", "close_job_id"),
      nowIso(),
      id
    );
  }

  private byId(id: number): MarketDailyRunRow | undefined {
    return db.prepare("SELECT * FROM market_daily_runs WHERE id = ?").get(id) as MarketDailyRunRow | undefined;
  }
}

export const marketRunRepository = new MarketRunRepository();
