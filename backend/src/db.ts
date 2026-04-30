/**
 * Rôle du fichier : initialiser la base SQLite embarquée, exposer un petit adaptateur
 * compatible avec sql.js et créer les tables nécessaires aux données utilisateur et caches.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type BindParams, type Database as SqlJsDatabase, type Statement } from "sql.js";
import { config } from "./config.js";

const directory = path.dirname(config.sqlitePath);
if (directory && directory !== ".") {
  fs.mkdirSync(directory, { recursive: true });
}

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
const SQL = await initSqlJs({ locateFile: () => wasmPath });
const fileBuffer = fs.existsSync(config.sqlitePath) ? fs.readFileSync(config.sqlitePath) : undefined;

/**
 * Encapsule une requête préparée sql.js pour uniformiser les méthodes get/all/run.
 *
 * @param database Adaptateur chargé de persister la base après écriture.
 * @param statement Requête préparée par sql.js.
 * @returns Instance capable d'exécuter la requête avec des paramètres liés.
 */
class PreparedStatement {
  constructor(
    private database: DatabaseAdapter,
    private statement: Statement
  ) {}

  /**
   * Retourne la première ligne produite par la requête.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Ligne sous forme d'objet ou undefined si aucun résultat n'existe.
   */
  get(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    const row = this.statement.step() ? this.statement.getAsObject() : undefined;
    this.statement.free();
    return row;
  }

  /**
   * Retourne toutes les lignes produites par la requête.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Liste d'objets correspondant aux lignes SQLite.
   */
  all(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    const rows: Record<string, unknown>[] = [];
    while (this.statement.step()) rows.push(this.statement.getAsObject());
    this.statement.free();
    return rows;
  }

  /**
   * Exécute une requête d'écriture puis force la persistance du fichier SQLite.
   *
   * @param params Valeurs liées aux marqueurs SQL.
   * @returns Rien.
   */
  run(...params: unknown[]) {
    this.statement.bind(params as BindParams);
    this.statement.step();
    this.statement.free();
    this.database.persist();
  }
}

/**
 * Fournit une façade minimale autour de sql.js avec persistance automatique sur disque.
 *
 * @param buffer Contenu SQLite existant, lorsqu'un fichier de base est déjà présent.
 * @returns Adaptateur de base utilisé par les services backend.
 */
class DatabaseAdapter {
  private database: SqlJsDatabase;

  constructor(buffer?: Buffer) {
    this.database = buffer ? new SQL.Database(buffer) : new SQL.Database();
  }

  /**
   * Exécute un bloc SQL complet et sauvegarde la base.
   *
   * @param sql Instructions SQL à appliquer.
   * @returns Rien.
   */
  exec(sql: string) {
    this.database.exec(sql);
    this.persist();
  }

  /**
   * Prépare une requête SQL paramétrable.
   *
   * @param sql Requête SQL avec marqueurs éventuels.
   * @returns Requête préparée via l'adaptateur local.
   */
  prepare(sql: string) {
    return new PreparedStatement(this, this.database.prepare(sql));
  }

  /**
   * Sauvegarde l'état courant de sql.js dans le fichier configuré.
   *
   * @returns Rien.
   */
  persist() {
    fs.writeFileSync(config.sqlitePath, Buffer.from(this.database.export()));
  }
}

export const db = new DatabaseAdapter(fileBuffer);

db.exec(`
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    average_buy_price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    traded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    exchange TEXT,
    currency TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    range TEXT NOT NULL,
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
    UNIQUE(asset_id, range, interval, datetime_start),
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

  CREATE TABLE IF NOT EXISTS asset_static_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_market_cache (
    symbol TEXT PRIMARY KEY,
    market_state TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_chart_cache (
    cache_key TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    range TEXT NOT NULL,
    interval TEXT NOT NULL,
    market_state TEXT,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_dividend_cache (
    symbol TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
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
`);

const assetColumns = db.prepare("PRAGMA table_info(assets)").all().map((row: any) => String(row.name));
if (!assetColumns.includes("id")) {
  db.exec(`
    ALTER TABLE assets RENAME TO assets_legacy;
    CREATE TABLE assets (
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
    INSERT INTO assets (symbol, name, exchange, currency, quote_type, type_disp, updated_at)
    SELECT symbol, name, exchange, currency, type, type, datetime(updated_at / 1000, 'unixepoch')
    FROM assets_legacy;
    DROP TABLE assets_legacy;
  `);
}

try {
  db.exec("ALTER TABLE positions ADD COLUMN notes TEXT;");
} catch {
  // Column already exists in existing SQLite files.
}

const assetIconColumns = db.prepare("PRAGMA table_info(asset_icons)").all().map((row: any) => String(row.name));
if (assetIconColumns.includes("icon_url") || !assetIconColumns.includes("file_path")) {
  db.exec(`
    DROP TABLE IF EXISTS asset_icons;
    CREATE TABLE asset_icons (
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
  `);
}

for (const migration of [
  "ALTER TABLE users ADD COLUMN profile_icon_path TEXT;",
  "ALTER TABLE users ADD COLUMN profile_icon_mime_type TEXT;",
  "ALTER TABLE users ADD COLUMN profile_icon_size INTEGER;",
  "ALTER TABLE users ADD COLUMN dashboard_default_sort_key TEXT NOT NULL DEFAULT 'name';",
  "ALTER TABLE users ADD COLUMN dashboard_default_sort_direction TEXT NOT NULL DEFAULT 'asc';",
  "ALTER TABLE users ADD COLUMN default_chart_range TEXT NOT NULL DEFAULT '1d';",
  "ALTER TABLE users ADD COLUMN local_pea_search_enabled INTEGER NOT NULL DEFAULT 1;",
  "ALTER TABLE users ADD COLUMN asset_news_enabled INTEGER NOT NULL DEFAULT 1;",
  "ALTER TABLE users ADD COLUMN news_language_fr_enabled INTEGER NOT NULL DEFAULT 1;",
  "ALTER TABLE users ADD COLUMN news_language_en_enabled INTEGER NOT NULL DEFAULT 0;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column already exists in existing SQLite files.
  }
}

for (const migration of [
  "ALTER TABLE transactions ADD COLUMN source TEXT;",
  "ALTER TABLE transactions ADD COLUMN source_file_name TEXT;",
  "ALTER TABLE transactions ADD COLUMN asset_name TEXT;",
  "ALTER TABLE transactions ADD COLUMN isin TEXT;",
  "ALTER TABLE transactions ADD COLUMN ticker TEXT;",
  "ALTER TABLE transactions ADD COLUMN total_fees REAL;",
  "ALTER TABLE transactions ADD COLUMN raw_text_snippet TEXT;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column already exists in existing SQLite files.
  }
}

for (const migration of [
  "ALTER TABLE transactions DROP COLUMN gross_amount;",
  "ALTER TABLE transactions DROP COLUMN commission;",
  "ALTER TABLE transactions DROP COLUMN fees;",
  "ALTER TABLE transactions DROP COLUMN net_amount;"
]) {
  try {
    db.exec(migration);
  } catch {
    // Column does not exist, or SQLite cannot drop it in this environment.
  }
}
