export const operationsSchema = `
  CREATE TABLE IF NOT EXISTS financial_objectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL,
    assumptions_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS objective_projection_cache (
    objective_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    projection_json TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    next_update_at TEXT NOT NULL,
    FOREIGN KEY(objective_id) REFERENCES financial_objectives(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval ON chart_candles(asset_id, range_key, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_asset_range_interval_start ON chart_candles(asset_id, range_key, interval, datetime_start);
  CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
  CREATE INDEX IF NOT EXISTS idx_positions_user_symbol ON positions(user_id, symbol);
  CREATE INDEX IF NOT EXISTS idx_transactions_position_traded_at ON transactions(position_id, traded_at);
  CREATE INDEX IF NOT EXISTS idx_watchlist_user_symbol ON watchlist(user_id, symbol);
  CREATE INDEX IF NOT EXISTS idx_portfolio_chart_cache_expires_at ON portfolio_chart_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_portfolio_positions_performance_cache_user_range ON portfolio_positions_performance_cache(user_id, range);
  CREATE INDEX IF NOT EXISTS idx_portfolio_positions_performance_cache_expires_at ON portfolio_positions_performance_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_frontend_block_cache_user_block ON frontend_block_cache(user_id, block);
  CREATE INDEX IF NOT EXISTS idx_frontend_block_cache_expires_at ON frontend_block_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_financial_objectives_user_active ON financial_objectives(user_id, active);
  CREATE INDEX IF NOT EXISTS idx_objective_projection_cache_next_update ON objective_projection_cache(next_update_at);
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
    priority INTEGER NOT NULL DEFAULT 100,
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
  -- L'index (status, priority, id) est créé par la migration 026 après l'ALTER ADD COLUMN
  -- priority. Sur une base existante migrant depuis < v26, la colonne n'existe pas avant
  -- l'ALTER, donc l'index ne peut pas être créé dans le schéma initial.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_data_construction_tasks_active_key
    ON data_construction_tasks(task_key)
    WHERE status IN ('queued', 'running');
`;
