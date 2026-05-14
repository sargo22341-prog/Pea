import type { DatabaseAdapter } from "./db-adapter.js";
import { appliquerMigrations } from "./db-migrations.js";

export function initializeSchema(db: DatabaseAdapter): void {
  db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_buy_price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total_fees REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    traded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL DEFAULT 'manual',
    source_file_name TEXT,
    asset_name TEXT,
    isin TEXT,
    ticker TEXT,
    raw_text_snippet TEXT,
    FOREIGN KEY(position_id) REFERENCES positions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cached_quotes (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_dividends (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_news (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_fundamentals (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_history (
    cache_key TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    range TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_intraday_history (
    cache_key TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    range TEXT NOT NULL,
    interval TEXT NOT NULL,
    trading_day TEXT NOT NULL,
    payload TEXT NOT NULL,
    last_updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS yahoo_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    method TEXT NOT NULL,
    modules_json TEXT,
    ticker TEXT,
    tickers_json TEXT,
    ticker_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    internal_source TEXT,
    range TEXT,
    interval TEXT,
    cache_hit INTEGER NOT NULL DEFAULT 0,
    request_key TEXT
  );

  CREATE TABLE IF NOT EXISTS asset_icons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    file_path TEXT,
    mime_type TEXT,
    size INTEGER,
    source TEXT NOT NULL DEFAULT 'auto',
    fetch_status TEXT NOT NULL DEFAULT 'pending',
    last_attempt_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    profile_icon_url TEXT,
    profile_icon_path TEXT,
    profile_icon_mime_type TEXT,
    profile_icon_size INTEGER,
    dashboard_default_sort_key TEXT NOT NULL DEFAULT 'name',
    dashboard_default_sort_direction TEXT NOT NULL DEFAULT 'asc',
    watchlist_default_sort_key TEXT NOT NULL DEFAULT 'name',
    watchlist_default_sort_direction TEXT NOT NULL DEFAULT 'asc',
    default_chart_range TEXT NOT NULL DEFAULT '1d',
    local_pea_search_enabled INTEGER NOT NULL DEFAULT 1,
    asset_news_enabled INTEGER NOT NULL DEFAULT 1,
    news_language_fr_enabled INTEGER NOT NULL DEFAULT 1,
    news_language_en_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    exchange TEXT,
    currency TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    exchange TEXT,
    currency TEXT,
    quote_type TEXT,
    type_disp TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS asset_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL UNIQUE,
    country TEXT,
    sector TEXT,
    industry TEXT,
    website TEXT,
    long_business_summary TEXT,
    full_time_employees INTEGER,
    market_cap REAL,
    beta REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chart_candles_1d (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    interval TEXT NOT NULL,
    datetime_start TEXT NOT NULL,
    datetime_end TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, interval, datetime_start),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chart_candles_1w (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    interval TEXT NOT NULL,
    datetime_start TEXT NOT NULL,
    datetime_end TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, interval, datetime_start),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chart_candles_1m (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    interval TEXT NOT NULL,
    datetime_start TEXT NOT NULL,
    datetime_end TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, interval, datetime_start),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chart_candles_all (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    interval TEXT NOT NULL,
    datetime_start TEXT NOT NULL,
    datetime_end TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, interval, datetime_start),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS market_data_finalizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    trading_date TEXT NOT NULL,
    range TEXT NOT NULL,
    finalized INTEGER NOT NULL DEFAULT 1,
    finalized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, trading_date, range),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduler_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_key TEXT NOT NULL,
    run_date TEXT NOT NULL,
    reason TEXT,
    job_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_key, run_date)
  );

  CREATE TABLE IF NOT EXISTS asset_market_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL UNIQUE,
    market_state TEXT,
    last_price REAL,
    day_change REAL,
    day_change_percent REAL,
    previous_close REAL,
    open_price REAL,
    day_high REAL,
    day_low REAL,
    volume REAL,
    bid_price REAL,
    ask_price REAL,
    bid_size REAL,
    ask_size REAL,
    average_volume_3m REAL,
    average_volume_10d REAL,
    fifty_two_week_low REAL,
    fifty_two_week_high REAL,
    fifty_two_week_change_percent REAL,
    ex_dividend_date TEXT,
    dividend_rate REAL,
    dividend_yield REAL,
    trailing_annual_dividend_rate REAL,
    trailing_annual_dividend_yield REAL,
    currency TEXT,
    exchange TEXT,
    full_exchange_name TEXT,
    quote_type TEXT,
    regular_market_time TEXT,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    last_checked_at TEXT,
    market_core_updated_at TEXT,
    liquidity_updated_at TEXT,
    range_52w_updated_at TEXT,
    dividend_info_updated_at TEXT,
    market_profile_updated_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_financials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    period TEXT NOT NULL,
    total_revenue REAL,
    net_income REAL,
    gross_profit REAL,
    operating_income REAL,
    ebitda REAL,
    net_margin REAL,
    currency TEXT,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, fiscal_year, period),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_dividends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    ex_date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset_id, ex_date, amount),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_assets (
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_price REAL NOT NULL,
    transaction_count INTEGER NOT NULL,
    total_fees REAL NOT NULL,
    invested_amount REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS asset_article_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_chart_cache (
    cache_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    range TEXT NOT NULL,
    market_state TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_positions_performance_cache (
    cache_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    range TEXT NOT NULL,
    portfolio_version TEXT NOT NULL,
    market_data_version TEXT NOT NULL,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS frontend_block_cache (
    cache_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    block TEXT NOT NULL,
    range TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chart_candles_1d_asset_interval ON chart_candles_1d(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1w_asset_interval ON chart_candles_1w(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1m_asset_interval ON chart_candles_1m(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_all_asset_interval ON chart_candles_all(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1d_asset_interval_start ON chart_candles_1d(asset_id, interval, datetime_start);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1w_asset_interval_start ON chart_candles_1w(asset_id, interval, datetime_start);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1m_asset_interval_start ON chart_candles_1m(asset_id, interval, datetime_start);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_all_asset_interval_start ON chart_candles_all(asset_id, interval, datetime_start);
  CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
  CREATE INDEX IF NOT EXISTS idx_positions_user_symbol ON positions(user_id, symbol);
  CREATE INDEX IF NOT EXISTS idx_transactions_position_traded_at ON transactions(position_id, traded_at);
  CREATE INDEX IF NOT EXISTS idx_watchlist_user_symbol ON watchlist(user_id, symbol);
  CREATE INDEX IF NOT EXISTS idx_asset_article_cache_expires_at ON asset_article_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_portfolio_chart_cache_expires_at ON portfolio_chart_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_portfolio_positions_performance_cache_user_range ON portfolio_positions_performance_cache(user_id, range);
  CREATE INDEX IF NOT EXISTS idx_portfolio_positions_performance_cache_expires_at ON portfolio_positions_performance_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_frontend_block_cache_user_block ON frontend_block_cache(user_id, block);
  CREATE INDEX IF NOT EXISTS idx_frontend_block_cache_expires_at ON frontend_block_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_market_data_finalizations_asset_range_date ON market_data_finalizations(asset_id, range, trading_date DESC);
  CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_created_at ON yahoo_usage_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_method_created_at ON yahoo_usage_logs(method, created_at);
  CREATE INDEX IF NOT EXISTS idx_yahoo_usage_logs_ticker_created_at ON yahoo_usage_logs(ticker, created_at);

  CREATE TABLE IF NOT EXISTS asset_calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    is_estimate INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, event_type, event_date)
  );

  CREATE INDEX IF NOT EXISTS idx_asset_calendar_events_symbol ON asset_calendar_events(symbol);
  CREATE INDEX IF NOT EXISTS idx_asset_calendar_events_date ON asset_calendar_events(event_date);

  CREATE TABLE IF NOT EXISTS tracked_markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    timezone TEXT NOT NULL,
    sessions_json TEXT NOT NULL,
    overrides_json TEXT,
    assets_count INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_daily_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_key TEXT NOT NULL,
    trading_date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    open_expected_at TEXT,
    open_status TEXT NOT NULL DEFAULT 'pending',
    open_confirmed_at TEXT,
    open_attempts INTEGER NOT NULL DEFAULT 0,
    open_last_error TEXT,
    open_last_checked_at TEXT,
    next_open_check_at TEXT,
    open_status_message TEXT,
    open_job_id TEXT,
    close_expected_at TEXT,
    close_status TEXT NOT NULL DEFAULT 'pending',
    close_confirmed_at TEXT,
    close_attempts INTEGER NOT NULL DEFAULT 0,
    close_last_error TEXT,
    close_last_checked_at TEXT,
    next_close_check_at TEXT,
    close_status_message TEXT,
    close_job_id TEXT,
    assets_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(market_key, trading_date)
  );

  CREATE TABLE IF NOT EXISTS market_check_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_key TEXT NOT NULL,
    trading_date TEXT NOT NULL,
    phase TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    expected_at TEXT,
    yahoo_market_state TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    partial_success INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    symbols_count INTEGER NOT NULL DEFAULT 0,
    valid_symbols_count INTEGER NOT NULL DEFAULT 0,
    failed_symbols_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scheduler_health (
    scheduler_name TEXT PRIMARY KEY,
    last_tick_at TEXT,
    last_successful_tick_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scheduler_locks (
    lock_key TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    acquired_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS data_construction_jobs (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS data_construction_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    task_key TEXT NOT NULL,
    type TEXT NOT NULL,
    symbol TEXT,
    range TEXT,
    market_key TEXT,
    trading_date TEXT,
    phase TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES data_construction_jobs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_market_daily_runs_market_date ON market_daily_runs(market_key, trading_date);
  CREATE INDEX IF NOT EXISTS idx_market_check_logs_created_at ON market_check_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_scheduler_locks_expires_at ON scheduler_locks(expires_at);
  CREATE INDEX IF NOT EXISTS idx_data_construction_jobs_updated_at ON data_construction_jobs(updated_at);
  CREATE INDEX IF NOT EXISTS idx_data_construction_tasks_job_status ON data_construction_tasks(job_id, status);
  CREATE INDEX IF NOT EXISTS idx_data_construction_tasks_status_id ON data_construction_tasks(status, id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_data_construction_tasks_active_key
    ON data_construction_tasks(task_key)
    WHERE status IN ('queued', 'running');
  `);

// Applique les migrations incrémentales après la création du schéma initial
  appliquerMigrations(db);
}
