// Rôle du fichier : initialiser la base SQLite embarquée avec better-sqlite3,
// créer les tables initiales et appliquer les migrations de schéma.

import BetterSqlite3, { type Database as BetterSqliteDatabase, type Statement } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { appliquerMigrations } from "./db-migrations.js";

const directory = path.dirname(config.sqlitePath);
if (directory && directory !== ".") {
  fs.mkdirSync(directory, { recursive: true });
}

/**
 * Encapsule une requete preparee better-sqlite3 pour uniformiser get/all/run.
 *
 * @param statement Requete preparee par better-sqlite3.
 * @returns Instance capable d'executer la requete avec des parametres lies.
 */
class PreparedStatement {
  constructor(private statement: Statement) {}

  /**
   * Retourne la première ligne produite par la requête.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Ligne sous forme d'objet ou undefined si aucun résultat n'existe.
   */
  get(...params: unknown[]) {
    return this.statement.get(...params);
  }

  /**
   * Retourne toutes les lignes produites par la requête.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Liste d'objets correspondant aux lignes SQLite.
   */
  all(...params: unknown[]) {
    return this.statement.all(...params);
  }

  /**
   * Exécute une requête d'écriture puis force la persistance du fichier SQLite.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Nombre de lignes modifiees par SQLite.
   */
  run(...params: unknown[]) {
    return this.statement.run(...params).changes;
  }
}

export class DatabaseAdapter {
  private database: BetterSqliteDatabase;

  constructor(filePath: string) {
    this.database = new BetterSqlite3(filePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
  }

  /**
   * Execute un bloc SQL complet.
   *
   * @param sql Instructions SQL à appliquer.
   * @returns Rien.
   */
  exec(sql: string) {
    this.database.exec(sql);
  }

  /**
   * Prépare une requête SQL paramétrable.
   *
   * @param sql Requête SQL avec marqueurs éventuels.
   * @returns Requête préparée via l'adaptateur local.
   */
  prepare(sql: string) {
    return new PreparedStatement(this.database.prepare(sql));
  }

}

export const db = new DatabaseAdapter(config.sqlitePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
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
    user_id INTEGER NOT NULL DEFAULT 1,
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
    average_volume_3m REAL,
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
    user_id TEXT NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_chart_candles_1d_asset_interval ON chart_candles_1d(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1w_asset_interval ON chart_candles_1w(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_1m_asset_interval ON chart_candles_1m(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_chart_candles_all_asset_interval ON chart_candles_all(asset_id, interval);
  CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
  CREATE INDEX IF NOT EXISTS idx_positions_user_symbol ON positions(user_id, symbol);
  CREATE INDEX IF NOT EXISTS idx_transactions_position_traded_at ON transactions(position_id, traded_at);
  CREATE INDEX IF NOT EXISTS idx_watchlist_user_symbol ON watchlist(user_id, symbol);
  CREATE INDEX IF NOT EXISTS idx_asset_article_cache_expires_at ON asset_article_cache(expires_at);
  CREATE INDEX IF NOT EXISTS idx_portfolio_chart_cache_expires_at ON portfolio_chart_cache(expires_at);

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
`);

// Applique les migrations incrémentales après la création du schéma initial
appliquerMigrations(db);
