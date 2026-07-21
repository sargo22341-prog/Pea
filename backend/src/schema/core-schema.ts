export const coreSchema = `
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

  CREATE TABLE IF NOT EXISTS cache_entries (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (scope, key)
  );

  CREATE INDEX IF NOT EXISTS idx_cache_entries_scope ON cache_entries(scope);
  CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);

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
    bootstrap_admin INTEGER NOT NULL DEFAULT 0,
    profile_icon_url TEXT,
    profile_icon_path TEXT,
    profile_icon_mime_type TEXT,
    profile_icon_size INTEGER,
    dashboard_default_sort_key TEXT NOT NULL DEFAULT 'name',
    dashboard_default_sort_direction TEXT NOT NULL DEFAULT 'asc',
    watchlist_default_sort_key TEXT NOT NULL DEFAULT 'name',
    watchlist_default_sort_direction TEXT NOT NULL DEFAULT 'asc',
    default_chart_range TEXT NOT NULL DEFAULT '1d',
    projection_end_age INTEGER NOT NULL DEFAULT 90,
    local_pea_search_enabled INTEGER NOT NULL DEFAULT 1,
    asset_news_enabled INTEGER NOT NULL DEFAULT 1,
    news_language_fr_enabled INTEGER NOT NULL DEFAULT 1,
    news_language_en_enabled INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'fr',
    privacy_mode_enabled INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS chart_candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    range_key TEXT NOT NULL,
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
    UNIQUE(asset_id, range_key, interval, datetime_start),
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

`;
