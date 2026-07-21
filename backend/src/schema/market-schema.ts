export const marketSchema = `
  CREATE TABLE IF NOT EXISTS asset_quote_snapshot (
    asset_id INTEGER PRIMARY KEY,
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
    regular_market_time TEXT,
    currency TEXT,
    exchange TEXT,
    full_exchange_name TEXT,
    quote_type TEXT,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    last_checked_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_quote_range (
    asset_id INTEGER PRIMARY KEY,
    fifty_two_week_low REAL,
    fifty_two_week_high REAL,
    fifty_two_week_change_percent REAL,
    average_volume_3m REAL,
    average_volume_10d REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_dividend_snapshot (
    asset_id INTEGER PRIMARY KEY,
    ex_dividend_date TEXT,
    dividend_rate REAL,
    dividend_yield REAL,
    trailing_annual_dividend_rate REAL,
    trailing_annual_dividend_yield REAL,
    source TEXT NOT NULL DEFAULT 'yahoo-finance2',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );

  -- Vue de compatibilite : reproduit l ancienne mega-table asset_market_snapshots en LEFT
  -- JOIN sur les 3 tables splittees. Lecture seule (les ecritures se font directement sur
  -- asset_quote_snapshot / asset_quote_range / asset_dividend_snapshot via le repository).
  CREATE VIEW IF NOT EXISTS asset_market_snapshots AS
  SELECT
    q.asset_id,
    q.market_state,
    q.last_price,
    q.day_change,
    q.day_change_percent,
    q.previous_close,
    q.open_price,
    q.day_high,
    q.day_low,
    q.volume,
    q.bid_price,
    q.ask_price,
    q.bid_size,
    q.ask_size,
    q.regular_market_time,
    q.currency,
    q.exchange,
    q.full_exchange_name,
    q.quote_type,
    q.source,
    q.last_checked_at,
    r.fifty_two_week_low,
    r.fifty_two_week_high,
    r.fifty_two_week_change_percent,
    r.average_volume_3m,
    r.average_volume_10d,
    d.ex_dividend_date,
    d.dividend_rate,
    d.dividend_yield,
    d.trailing_annual_dividend_rate,
    d.trailing_annual_dividend_yield,
    q.updated_at AS market_core_updated_at,
    q.updated_at AS liquidity_updated_at,
    r.updated_at AS range_52w_updated_at,
    d.updated_at AS dividend_info_updated_at,
    q.updated_at AS market_profile_updated_at,
    COALESCE(q.updated_at, r.updated_at, d.updated_at) AS updated_at
  FROM asset_quote_snapshot q
  LEFT JOIN asset_quote_range r ON r.asset_id = q.asset_id
  LEFT JOIN asset_dividend_snapshot d ON d.asset_id = q.asset_id;

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

`;
